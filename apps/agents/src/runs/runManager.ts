import { randomUUID } from "node:crypto";
import type { PendingInteraction, RunRequest } from "@aqsha/agent-contracts";
import { RUN_ERROR_CODES, sanitizeRunErrorMessage } from "../agent/activitySanitizers";
import {
  buildAstraQueryOptions,
  type AstraQueryOptions,
} from "../agent/astra";
import {
  buildDeepPhasePrompt,
  DEEP_PHASES,
  DEEP_PHASE_POLICIES,
  isMaxTurnsStop,
  PHASE_BUDGET_EXHAUSTED_NOTE,
  phaseStateMap,
  priorOutputsFrom,
} from "../agent/deepPhases";
import { buildRunHooks } from "../agent/hooks";
import {
  buildCanUseTool,
  InteractionBroker,
  resumePromptForInteraction,
} from "../agent/interactions";
import { assemblePrompt } from "../agent/contextAssembly";
import { StreamBridge, type BridgeMessage } from "../agent/streamBridge";
import type { TurnPhase } from "../agent/toolPolicy";
import { parseServiceCommand, readSkillEntries } from "../commands/registry";
import type { AgentsConfig } from "../config";
import { buildProviderDeps } from "../providers";
import type { ProviderDeps } from "../providers/types";
import type { AgentStore, RunRecord } from "../store/types";
import { buildLiteratureSearcherAgents } from "../subagents";
import { selectDomainPack } from "../subagents/skillDelegation";
import {
  buildAqshaMcpServer,
  buildSandboxService,
  createCitationCounter,
  type SandboxService,
} from "../tools";

// Run manager (plan §4.2 runManager.ts): registry of active runs, concurrency
// cap, cancel, and the execute/interrupt/resume turn loop. The SDK call is
// injected as a QueryRunner so tests drive the loop with fake streams.

export type QueryHandle = {
  stream: AsyncIterable<BridgeMessage>;
  interrupt: () => Promise<void>;
};

export type QueryRunner = (input: {
  prompt: string;
  options: AstraQueryOptions;
}) => QueryHandle;

type ActiveRun = {
  runId: string;
  handle?: QueryHandle;
  canceled: boolean;
};

export class RunManager {
  readonly broker: InteractionBroker;
  private active = new Map<string, ActiveRun>();
  private runningCount = 0;
  private queue: Array<() => void> = [];
  private sandbox: SandboxService;
  private providerDeps: ProviderDeps;

  constructor(
    private readonly deps: {
      store: AgentStore;
      config: AgentsConfig;
      runner: QueryRunner;
      sandbox?: SandboxService;
      providerDeps?: ProviderDeps;
    },
  ) {
    this.broker = new InteractionBroker(deps.store, deps.config.holdWindowMs);
    this.sandbox =
      deps.sandbox ??
      buildSandboxService({
        daytonaApiKey: deps.config.providers.daytonaApiKey,
        snapshot: deps.config.providers.daytonaSnapshot,
        anthropicBaseUrl: deps.config.anthropicBaseUrl,
        anthropicApiKey: deps.config.anthropicApiKey,
        anthropicAuthToken: deps.config.anthropicAuthToken,
        extractionModel: deps.config.models.chatLite,
      });
    this.providerDeps = deps.providerDeps ?? buildProviderDeps(deps.config);
  }

  /** Accept a run request and execute it asynchronously. */
  async startRun(request: RunRequest): Promise<{ ok: true; runId: string }> {
    const { store } = this.deps;
    await store.upsertThread({
      threadId: request.threadId,
      ownerUserId: request.ownerUserId,
      agentKind: request.agentKind,
    });

    const serviceCommand = parseServiceCommand(request.prompt);
    const mode = serviceCommand?.name === "deep" ? "deep" : request.mode;
    const effectivePrompt =
      serviceCommand?.name === "deep" && serviceCommand.args
        ? serviceCommand.args
        : request.prompt;

    await store.createRun({
      runId: request.runId,
      threadId: request.threadId,
      ownerUserId: request.ownerUserId,
      agentKind: request.agentKind,
      mode,
      promptMessageId: request.promptMessageId,
    });

    // Convex normally writes the user message before triggering the service;
    // when it has not (dev / memory store), record it here for the transcript.
    if (!request.promptMessageId) {
      await store.createMessage({
        threadId: request.threadId,
        ownerUserId: request.ownerUserId,
        role: "user",
        text: request.prompt,
        runId: request.runId,
        status: "complete",
      });
    }

    void this.executeWhenSlotFree({ ...request, mode, prompt: effectivePrompt });
    return { ok: true, runId: request.runId };
  }

  /** Resume a waiting_hitl run after the user responded to an interaction. */
  async resumeRun(
    runId: string,
    interactionId: string,
  ): Promise<{ ok: boolean; reason?: string }> {
    const { store } = this.deps;
    const run = await store.getRun(runId);
    if (!run) {
      return { ok: false, reason: "run_not_found" };
    }
    if (run.status !== "waiting_hitl" && run.status !== "waiting") {
      return { ok: false, reason: "run_not_waiting" };
    }
    const interaction = await store.getInteraction(interactionId);
    if (!interaction || interaction.status !== "responded") {
      return { ok: false, reason: "interaction_not_responded" };
    }

    // Close the timeline's question/approval node on resume. An approval that
    // timed out resolves inside interactions.ts when its primed response is
    // consumed; ask_user has no such path, so emit interaction_resolved here so
    // its node never hangs on "waiting_approval".
    if (interaction.type === "ask_user") {
      await store.appendRunEvent({
        runId,
        type: "interaction_resolved",
        payload: { interactionId, toolName: interaction.toolName },
      });
    }

    const phase: TurnPhase =
      interaction.type === "tool_approval" &&
      interaction.toolName === "proposeArtifact" &&
      interaction.response?.kind === "approval" &&
      interaction.response.approved
        ? "resume_after_approval"
        : "initial";

    void this.executeWhenSlotFree(
      {
        runId: run.runId,
        threadId: run.threadId,
        ownerUserId: run.ownerUserId,
        agentKind: run.agentKind,
        mode: run.mode,
        prompt: resumePromptForInteraction(interaction),
        promptMessageId: undefined,
        contextRefs: { artifactIds: [], workspaceIds: [] },
      },
      { phase, resumeInteraction: interaction },
    );
    return { ok: true };
  }

  /** Cancel an active run (durable: status flips even if no stream is live). */
  async cancelRun(runId: string): Promise<{ ok: boolean }> {
    const { store } = this.deps;
    const run = await store.getRun(runId);
    if (!run) {
      return { ok: false };
    }
    const active = this.active.get(runId);
    if (active) {
      active.canceled = true;
    }
    if (["completed", "failed", "canceled"].includes(run.status)) {
      return { ok: true };
    }
    // Finalize + emit the terminal `canceled` event BEFORE interrupting the
    // stream. The execution loop only advances past its stream loop once it is
    // interrupted, so doing this first guarantees exactly one terminal event
    // here (the loop then re-finalizes idempotently and writes the assistant
    // message text). Interrupting first would let the loop finalize "canceled"
    // in the gap, and this method would observe a terminal status and skip the
    // event — leaving the timeline without an explicit "Dihentikan" marker.
    await store.finalizeRun(runId, { status: "canceled" });
    await store.setThreadStatus(run.threadId, "idle");
    await store.appendRunEvent({
      runId,
      type: "run_status",
      payload: { status: "canceled" },
    });
    if (active) {
      try {
        await active.handle?.interrupt();
      } catch {
        // Stream already finished — the canceled status/event is durable anyway.
      }
    }
    return { ok: true };
  }

  isActive(runId: string): boolean {
    return this.active.has(runId);
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private async executeWhenSlotFree(
    request: RunRequest,
    options?: { phase?: TurnPhase; resumeInteraction?: PendingInteraction },
  ): Promise<void> {
    await this.acquireSlot();
    try {
      if (request.mode === "deep") {
        await this.executeDeepRun(request, options);
      } else {
        await this.executeTurn(request, options);
      }
    } catch (error) {
      await this.failRun(
        request,
        error instanceof Error ? error.message : "Unexpected run failure",
      );
    } finally {
      this.releaseSlot();
    }
  }

  private async failRun(request: RunRequest, message: string): Promise<void> {
    const { store } = this.deps;
    await store.finalizeRun(request.runId, {
      status: "failed",
      errorMessage: message,
    });
    await store.setThreadStatus(request.threadId, "failed");
    // Stored `errorMessage` keeps the raw text for ops/logs; the client-facing
    // event payload is sanitized at the source (plan §8 Fase 2 item 3).
    await store.appendRunEvent({
      runId: request.runId,
      type: "error",
      payload: { message: sanitizeRunErrorMessage(message) },
    });
  }

  private acquireSlot(): Promise<void> {
    if (this.runningCount < this.deps.config.maxConcurrentRuns) {
      this.runningCount += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.runningCount += 1;
        resolve();
      });
    });
  }

  private releaseSlot(): void {
    this.runningCount -= 1;
    const next = this.queue.shift();
    next?.();
  }

  private async executeTurn(
    request: RunRequest,
    turn?: { phase?: TurnPhase; resumeInteraction?: PendingInteraction },
  ): Promise<void> {
    const { store, config } = this.deps;
    const phase = turn?.phase ?? "initial";
    const runId = request.runId;
    const isResume = Boolean(turn?.resumeInteraction);

    const run = await store.getRun(runId);
    const thread = await store.getThread(request.threadId);
    const resumeSessionId = run?.sdkSessionId ?? thread?.sdkSessionId;

    await store.setRunStatus(runId, "running");
    await store.setThreadStatus(request.threadId, "streaming");
    await store.appendRunEvent({
      runId,
      type: "run_status",
      payload: { status: "running", phase },
    });

    const assistantMessage = await store.createMessage({
      threadId: request.threadId,
      ownerUserId: request.ownerUserId,
      role: "assistant",
      text: "",
      runId,
      status: "streaming",
    });

    // Per-run tool context + MCP server (plan §5.1).
    const toolCtx = {
      runId,
      threadId: request.threadId,
      ownerUserId: request.ownerUserId,
      store,
      providers: this.providerDeps,
      broker: this.broker,
      sandbox: this.sandbox,
      config,
      nextCitationNumber: createCitationCounter(),
    };
    const mcpServer = buildAqshaMcpServer(toolCtx);

    // Prompt assembly: slash commands (non-/deep) pass through verbatim; a
    // missing session triggers full history rebuild from the store (§4.1.3).
    const isSlashCommand = request.prompt.startsWith("/") && !isResume;
    const needsHistoryRebuild = !resumeSessionId && !isSlashCommand;
    const assembled = isResume
      ? { prompt: request.prompt }
      : isSlashCommand
        ? { prompt: request.prompt }
        : await assemblePrompt({
            store,
            request,
            includeHistory: needsHistoryRebuild,
          });

    const abortController = new AbortController();
    const queryOptions = buildAstraQueryOptions({
      config,
      agentKind: request.agentKind,
      mode: request.mode,
      phase,
      resumeSessionId,
      mcpServer,
      hooks: buildRunHooks({ store, runId, threadId: request.threadId }),
      canUseTool: buildCanUseTool({
        broker: this.broker,
        runId,
        threadId: request.threadId,
        ownerUserId: request.ownerUserId,
      }),
      abortController,
    });

    const bridge = new StreamBridge(store, {
      runId,
      threadId: request.threadId,
      messageId: assistantMessage.messageId,
      flushMs: config.streamFlushMs,
      flushChars: config.streamFlushChars,
    });

    const activeRun: ActiveRun = { runId, canceled: false };
    this.active.set(runId, activeRun);

    let streamError: string | undefined;
    let interruptState: ReturnType<InteractionBroker["interruptState"]>;
    try {
      const handle = this.deps.runner({ prompt: assembled.prompt, options: queryOptions });
      activeRun.handle = handle;
      if (turn?.resumeInteraction) {
        // Timeout → respond → resume: the recorded response must satisfy the
        // model's retry of the gated tool instead of opening a new window.
        this.broker.primeResolvedApproval(runId, turn.resumeInteraction);
      }
      this.broker.registerRun(runId, () => {
        void handle.interrupt().catch(() => {
          // Stream may already be closed; interrupt state still drives status.
        });
      });

      for await (const message of handle.stream) {
        await bridge.handle(message);
      }
    } catch (error) {
      streamError = error instanceof Error ? error.message : "Stream failed";
    } finally {
      // Snapshot before unregister clears the broker's per-run state.
      interruptState = this.broker.interruptState(runId);
      this.broker.unregisterRun(runId);
      this.active.delete(runId);
    }

    await bridge.flush();
    const result = bridge.result();

    // Persist the session id for resume regardless of how the turn ended.
    if (result.sessionId) {
      await store.setThreadSession(request.threadId, result.sessionId);
    }

    if (activeRun.canceled) {
      await store.finalizeMessage(assistantMessage.messageId, {
        text: result.finalText,
        status: "complete",
      });
      await store.finalizeRun(runId, {
        status: "canceled",
        sdkSessionId: result.sessionId,
      });
      await store.setThreadStatus(request.threadId, "idle");
      return;
    }

    if (interruptState) {
      // HITL pause: askUser or an approval hold-window that elapsed.
      await store.finalizeMessage(assistantMessage.messageId, {
        text: result.finalText,
        status: "complete",
      });
      await store.finalizeRun(runId, {
        status: "waiting_hitl",
        sdkSessionId: result.sessionId,
      });
      await store.setThreadStatus(request.threadId, "idle");
      await store.appendRunEvent({
        runId,
        type: "run_status",
        payload: {
          status: "waiting_hitl",
          reason: interruptState.reason,
          interactionId: interruptState.pendingInteractionId,
        },
      });
      // Race guard: the user may have responded in the instant between the
      // hold-window expiring and the run finalizing as waiting_hitl (the
      // responder only forwards a resume when it OBSERVES waiting_hitl).
      // If the interaction is already responded, resume ourselves.
      if (interruptState.pendingInteractionId) {
        const interaction = await store.getInteraction(
          interruptState.pendingInteractionId,
        );
        if (interaction?.status === "responded") {
          void this.resumeRun(runId, interaction.id);
        }
      }
      return;
    }

    if (streamError || (result.resultSubtype && result.resultSubtype !== "success")) {
      await store.finalizeMessage(assistantMessage.messageId, {
        text: result.finalText || "Maaf, terjadi kesalahan saat memproses permintaan ini.",
        status: "error",
      });
      await store.finalizeRun(runId, {
        status: "failed",
        sdkSessionId: result.sessionId,
        costUsd: result.summary.costUsd,
        usage: result.summary.usage,
        numTurns: result.summary.numTurns,
        errorMessage: streamError ?? result.resultSubtype,
      });
      await store.setThreadStatus(request.threadId, "failed");
      await store.appendRunEvent({
        runId,
        type: "error",
        payload: { message: sanitizeRunErrorMessage(streamError ?? result.resultSubtype) },
      });
      return;
    }

    await store.finalizeMessage(assistantMessage.messageId, {
      text: result.finalText,
      status: "complete",
    });
    await store.finalizeRun(runId, {
      status: "completed",
      sdkSessionId: result.sessionId,
      costUsd: result.summary.costUsd,
      usage: result.summary.usage,
      numTurns: result.summary.numTurns,
    });
    await store.setThreadStatus(request.threadId, "idle");
    await store.appendRunEvent({
      runId,
      type: "run_status",
      payload: { status: "completed", costUsd: result.summary.costUsd },
    });
  }

  // ── deep research: durable multi-phase orchestration (plan §5.5, Step 4) ──
  //
  // A /deep run executes as a sequence of ISOLATED query() calls (no session
  // chaining between phases); each phase persists its output via
  // upsertResearchPhase before the next starts. Re-dispatching the run (user
  // retry after a crash, watchdog-failed run) replays only missing phases, and
  // a HITL interrupt in any phase resumes THAT phase's own SDK session.

  /** Recover the research question across restarts/resumes. */
  private async deepQuestion(request: RunRequest, isResume: boolean): Promise<string> {
    if (!isResume) {
      return request.prompt;
    }
    const messages = await this.deps.store.listMessages(request.threadId, 100);
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (message?.role === "user" && message.text.trim()) {
        const text = message.text.trim();
        return text.startsWith("/deep") ? text.slice("/deep".length).trim() : text;
      }
    }
    return request.prompt;
  }

  private async executeDeepRun(
    request: RunRequest,
    turn?: { phase?: TurnPhase; resumeInteraction?: PendingInteraction },
  ): Promise<void> {
    const { store, config } = this.deps;
    const runId = request.runId;
    const isResume = Boolean(turn?.resumeInteraction);

    await store.setRunStatus(runId, "running");
    await store.setThreadStatus(request.threadId, "streaming");
    await store.appendRunEvent({
      runId,
      type: "run_status",
      payload: { status: "running", mode: "deep", resume: isResume },
    });

    const question = await this.deepQuestion(request, isResume);
    const states = phaseStateMap(await store.listResearchPhases(runId));
    const writerSkill = selectDomainPack(question, readSkillEntries(config.appRoot));

    const assistantMessage = await store.createMessage({
      threadId: request.threadId,
      ownerUserId: request.ownerUserId,
      role: "assistant",
      text: "",
      runId,
      status: "streaming",
    });

    const activeRun: ActiveRun = { runId, canceled: false };
    this.active.set(runId, activeRun);
    // The resume response satisfies the model's retry of the gated tool in the
    // resumed phase instead of opening a fresh hold-window.
    if (turn?.resumeInteraction) {
      this.broker.primeResolvedApproval(runId, turn.resumeInteraction);
    }
    let resumeConsumed = false;
    // Custom cost guard (no maxBudgetUsd in the SDK — plan §9.2 #1): bounds
    // the spend of THIS dispatch; a retry continues from the persisted phases
    // with a fresh allowance, so progress stays possible but bounded per click.
    let dispatchCostUsd = 0;

    try {
      for (const phase of DEEP_PHASES) {
        const existing = states[phase];
        if (existing?.status === "done") {
          continue;
        }
        if (activeRun.canceled) {
          break;
        }
        if (dispatchCostUsd >= config.maxRunBudgetUsd) {
          await store.finalizeMessage(assistantMessage.messageId, {
            text: `Riset mendalam dihentikan sementara: batas biaya per percobaan (US$${config.maxRunBudgetUsd}) tercapai. Fase yang selesai tersimpan — coba kirim ulang untuk melanjutkan.`,
            status: "error",
          });
          await store.finalizeRun(runId, {
            status: "failed",
            errorMessage: `Run budget exceeded (US$${config.maxRunBudgetUsd} per dispatch)`,
          });
          await store.setThreadStatus(request.threadId, "failed");
          await store.appendRunEvent({
            runId,
            type: "error",
            payload: {
              message: sanitizeRunErrorMessage(RUN_ERROR_CODES.budgetExhausted),
              dispatchCostUsd,
            },
          });
          return;
        }
        const policy = DEEP_PHASE_POLICIES[phase];

        // Only the first non-done phase can be the interrupted one; later
        // phases always start fresh.
        const resumingThisPhase =
          isResume && !resumeConsumed && Boolean(existing?.sdkSessionId);
        const prompt = resumingThisPhase
          ? resumePromptForInteraction(turn!.resumeInteraction!)
          : buildDeepPhasePrompt({
              phase,
              question,
              contextBlock:
                phase === "plan" ? await this.deepContextBlock(request) : undefined,
              priorOutputs: priorOutputsFrom(states),
              writerSkill: phase === "write" ? writerSkill : undefined,
            });
        const turnPhase: TurnPhase = resumingThisPhase
          ? (turn?.phase ?? "initial")
          : "initial";
        if (resumingThisPhase) {
          resumeConsumed = true;
        }

        await store.upsertResearchPhase({ runId, phase, status: "running" });
        await store.appendRunEvent({
          runId,
          type: "phase_start",
          payload: { phase, resumed: resumingThisPhase },
        });

        const toolCtx = {
          runId,
          threadId: request.threadId,
          ownerUserId: request.ownerUserId,
          store,
          providers: this.providerDeps,
          broker: this.broker,
          sandbox: this.sandbox,
          config,
          nextCitationNumber: createCitationCounter(),
        };
        const abortController = new AbortController();
        const options = buildAstraQueryOptions({
          config,
          agentKind: request.agentKind,
          mode: "deep",
          phase: turnPhase,
          resumeSessionId: resumingThisPhase ? existing?.sdkSessionId : undefined,
          mcpServer: buildAqshaMcpServer(toolCtx),
          hooks: buildRunHooks({ store, runId, threadId: request.threadId }),
          canUseTool: buildCanUseTool({
            broker: this.broker,
            runId,
            threadId: request.threadId,
            ownerUserId: request.ownerUserId,
          }),
          agents: policy.useSubagents
            ? buildLiteratureSearcherAgents({ config, agentKind: request.agentKind })
            : undefined,
          abortController,
          maxTurnsOverride: policy.maxTurns,
        });

        const bridge = new StreamBridge(store, {
          runId,
          threadId: request.threadId,
          messageId: assistantMessage.messageId,
          flushMs: config.streamFlushMs,
          flushChars: config.streamFlushChars,
          silent: !policy.streamsToChat,
        });

        let streamError: string | undefined;
        let interruptState: ReturnType<InteractionBroker["interruptState"]>;
        try {
          const handle = this.deps.runner({ prompt, options });
          activeRun.handle = handle;
          this.broker.registerRun(runId, () => {
            void handle.interrupt().catch(() => {});
          });
          for await (const message of handle.stream) {
            await bridge.handle(message);
          }
        } catch (error) {
          streamError = error instanceof Error ? error.message : "Stream failed";
        } finally {
          interruptState = this.broker.interruptState(runId);
          this.broker.unregisterRun(runId);
        }

        await bridge.flush();
        const result = bridge.result();
        dispatchCostUsd += result.summary.costUsd ?? 0;

        if (activeRun.canceled) {
          break;
        }

        if (interruptState) {
          // HITL pause inside this phase: persist the phase session so the
          // resume re-enters THIS phase, then park the run.
          await store.upsertResearchPhase({
            runId,
            phase,
            status: "running",
            sdkSessionId: result.sessionId,
            costUsd: sumCost(existing?.costUsd, result.summary.costUsd),
          });
          await store.finalizeMessage(assistantMessage.messageId, {
            text: result.finalText,
            status: "complete",
          });
          await store.finalizeRun(runId, { status: "waiting_hitl" });
          await store.setThreadStatus(request.threadId, "idle");
          await store.appendRunEvent({
            runId,
            type: "run_status",
            payload: {
              status: "waiting_hitl",
              phase,
              reason: interruptState.reason,
              interactionId: interruptState.pendingInteractionId,
            },
          });
          // Same respond-while-finalizing race guard as the normal turn loop.
          if (interruptState.pendingInteractionId) {
            const interaction = await store.getInteraction(
              interruptState.pendingInteractionId,
            );
            if (interaction?.status === "responded") {
              void this.resumeRun(runId, interaction.id);
            }
          }
          return;
        }

        // Turn-budget exhaustion degrades to done-partial (legacy "budget
        // exhausted" semantics) when the phase produced usable text — or when
        // the phase is an optional quality gate, which must not kill the run.
        const maxTurnsStop = isMaxTurnsStop({
          streamError,
          resultSubtype: result.resultSubtype,
        });
        const maxTurnsPartial =
          maxTurnsStop &&
          (result.finalText.trim().length > 0 || policy.optional === true);

        if (
          !maxTurnsPartial &&
          (streamError ||
            (result.resultSubtype && result.resultSubtype !== "success"))
        ) {
          const message = streamError ?? `phase ${phase}: ${result.resultSubtype}`;
          await store.upsertResearchPhase({
            runId,
            phase,
            status: "failed",
            costUsd: sumCost(existing?.costUsd, result.summary.costUsd),
          });
          await store.finalizeMessage(assistantMessage.messageId, {
            text:
              result.finalText ||
              "Maaf, riset mendalam terhenti karena kesalahan. Coba kirim ulang untuk melanjutkan dari fase terakhir.",
            status: "error",
          });
          await store.finalizeRun(runId, { status: "failed", errorMessage: message });
          await store.setThreadStatus(request.threadId, "failed");
          await store.appendRunEvent({
            runId,
            type: "error",
            payload: { phase, message: sanitizeRunErrorMessage(message) },
          });
          return;
        }

        const doneState = await store.upsertResearchPhase({
          runId,
          phase,
          status: "done",
          output: result.finalText.trim() || PHASE_BUDGET_EXHAUSTED_NOTE,
          sdkSessionId: result.sessionId,
          costUsd: sumCost(existing?.costUsd, result.summary.costUsd),
        });
        states[phase] = doneState;
        await store.appendRunEvent({
          runId,
          type: "phase_done",
          payload: { phase, costUsd: result.summary.costUsd },
        });
      }
    } finally {
      this.broker.unregisterRun(runId);
      this.active.delete(runId);
    }

    const finalStates = await store.listResearchPhases(runId);
    const totalCost = finalStates.reduce(
      (sum, state) => sum + (state.costUsd ?? 0),
      0,
    );

    if (activeRun.canceled) {
      const writeText = states.write?.output ?? "";
      await store.finalizeMessage(assistantMessage.messageId, {
        text: writeText,
        status: "complete",
      });
      await store.finalizeRun(runId, {
        status: "canceled",
        costUsd: totalCost > 0 ? totalCost : undefined,
      });
      await store.setThreadStatus(request.threadId, "idle");
      return;
    }

    await store.finalizeMessage(assistantMessage.messageId, {
      text: states.write?.output ?? "",
      status: "complete",
    });
    await store.finalizeRun(runId, {
      status: "completed",
      costUsd: totalCost > 0 ? totalCost : undefined,
    });
    await store.setThreadStatus(request.threadId, "idle");
    await store.appendRunEvent({
      runId,
      type: "run_status",
      payload: { status: "completed", costUsd: totalCost },
    });
  }

  /** Artifact/manifest context for the plan phase (no question appended). */
  private async deepContextBlock(request: RunRequest): Promise<string | undefined> {
    const assembled = await assemblePrompt({
      store: this.deps.store,
      request: { ...request, prompt: "" },
      includeHistory: false,
    });
    const block = assembled.prompt.trim();
    return block ? block : undefined;
  }

}

function sumCost(...values: Array<number | undefined>): number | undefined {
  const total = values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  return total > 0 ? total : undefined;
}

/** Generate a run id when the caller (dev tools) does not provide one. */
export function newRunId(): string {
  return `run_${randomUUID()}`;
}

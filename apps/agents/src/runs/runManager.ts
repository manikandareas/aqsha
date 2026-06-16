import { randomUUID } from "node:crypto";
import {
  parseResearchPlanPayload,
  renderResearchPlanMarkdown,
  type PendingInteraction,
  type RunRequest,
} from "@aqsha/agent-contracts";
import { RUN_ERROR_CODES, sanitizeRunErrorMessage } from "../agent/activitySanitizers";
import {
  buildAstraQueryOptions,
  type AstraQueryOptions,
} from "../agent/astra";
import {
  buildDeepPhasePrompt,
  DEEP_PHASES,
  DEEP_PHASE_POLICIES,
  type DeepPhase,
  isMaxTurnsStop,
  PHASE_BUDGET_EXHAUSTED_NOTE,
  phaseStateMap,
  priorOutputsFrom,
} from "../agent/deepPhases";
import { buildRunHooks, type OpenNodeTracker } from "../agent/hooks";
import { SegmentCoordinator } from "../agent/segmentCoordinator";
import {
  buildCanUseTool,
  InteractionBroker,
  resumePromptForInteraction,
} from "../agent/interactions";
import { assemblePrompt } from "../agent/contextAssembly";
import { StreamBridge, type BridgeMessage } from "../agent/streamBridge";
import { backoffDelayMs, isTransientConnectionError } from "./retry";
import type { TurnPhase } from "../agent/toolPolicy";
import { parseServiceCommand, readSkillEntries } from "../commands/registry";
import type { AgentsConfig } from "../config";
import { buildProviderDeps } from "../providers";
import type { ProviderDeps } from "../providers/types";
import type { AgentStore, RunRecord } from "../store/types";
import { buildDeepResearchSubagents } from "../subagents";
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

/** One stream attempt's freshly-built options + bridge (rebuilt on retry). */
type StreamAttempt = {
  options: AstraQueryOptions;
  bridge: StreamBridge;
};

/** Outcome of driving a stream to completion (across any transient retries). */
type StreamOutcome = {
  bridge: StreamBridge;
  streamError?: string;
  interruptState: ReturnType<InteractionBroker["interruptState"]>;
  /** Total measurable cost across ALL attempts (failed ones included). */
  costUsd: number;
};

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
    this.broker = new InteractionBroker(deps.store);
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

  // ── streaming with transient-retry (shared by normal turns + deep phases) ──
  //
  // Drives ONE logical turn/phase to completion, auto-retrying a TRANSIENT
  // connection drop (network switch, gateway idle-timeout, socket reset) from
  // scratch with exponential backoff. A fresh bridge/options is built per attempt
  // (buildAttempt) so the failed partial is discarded; the caller's stable
  // turnKey makes the retry's answer segments overwrite the dead attempt's rows.
  // HITL interrupts and cancels never retry — only a transient failure does.

  private async runStreamWithRetry(input: {
    runId: string;
    prompt: string;
    activeRun: ActiveRun;
    buildAttempt: (openNodes: OpenNodeTracker) => StreamAttempt;
    /** Re-arm a resume's approved-tool response before each attempt. */
    prime?: () => void;
    /** Deep-phase tag for the retry notice (omitted for normal turns). */
    phase?: DeepPhase;
    /**
     * Set false to forbid retries even on a transient drop — used when this turn
     * re-executes an approved, side-effecting tool (a whole-turn replay would
     * duplicate the artifact/workspace, since executeArtifact is not idempotent).
     */
    allowRetry?: boolean;
  }): Promise<StreamOutcome> {
    const { runId, activeRun } = input;
    const { streamMaxRetries, streamRetryBaseMs, streamRetryMaxMs } = this.deps.config;
    let bridge!: StreamBridge;
    let streamError: string | undefined;
    let interruptState: ReturnType<InteractionBroker["interruptState"]>;
    let costUsd = 0;
    let attempt = 0;
    try {
      while (true) {
        attempt += 1;
        // Fresh per-attempt open-node tracker: any tool/sub-agent the dropped
        // attempt leaves open is closed (below) before the retry re-opens its own.
        const openNodes: OpenNodeTracker = { tools: new Map(), subagents: new Set() };
        const built = input.buildAttempt(openNodes);
        bridge = built.bridge;
        streamError = undefined;
        // Prime BEFORE the stream so the gated tool's canUseTool sees the response.
        input.prime?.();
        const handle = this.deps.runner({ prompt: input.prompt, options: built.options });
        activeRun.handle = handle;
        this.broker.registerRun(runId, () => {
          void handle.interrupt().catch(() => {
            // Stream may already be closed; interrupt state still drives status.
          });
        });
        try {
          for await (const message of handle.stream) {
            await bridge.handle(message);
          }
        } catch (error) {
          streamError = error instanceof Error ? error.message : "Stream failed";
        }
        // Snapshot before the outer finally unregisters (which clears it).
        interruptState = this.broker.interruptState(runId);

        // Sum every attempt's measurable spend so the deep budget guard and the
        // persisted cost reflect the true total, not just the surviving attempt.
        const result = bridge.result();
        costUsd += result.summary.costUsd ?? 0;

        // A dropped connection surfaces either as a THROW (streamError) or as a
        // non-success result message carrying the API error text. Retry only a
        // transient one — never a HITL pause, a cancel, a forbidden replay, or a
        // terminal fault (max-turns/auth/budget never match the transient check).
        const failure =
          streamError ??
          (result.resultSubtype && result.resultSubtype !== "success"
            ? result.summary.resultText ?? result.resultSubtype
            : undefined);
        const retriable =
          input.allowRetry !== false &&
          !interruptState &&
          !activeRun.canceled &&
          attempt <= streamMaxRetries &&
          isTransientConnectionError(failure);
        if (!retriable) {
          break;
        }
        // Close the dead attempt's still-open tool/sub-agent nodes so they fold
        // into ONE failed node instead of orphaning as a duplicate branch.
        await this.closeOrphanNodes(runId, openNodes);
        const delayMs = backoffDelayMs({
          attempt,
          baseMs: streamRetryBaseMs,
          maxMs: streamRetryMaxMs,
        });
        console.warn(
          `[run ${runId}${input.phase ? ` ${input.phase}` : ""}] transient stream drop ` +
            `(attempt ${attempt}/${streamMaxRetries}), retrying in ${delayMs}ms: ${failure}`,
        );
        await this.emitRetryNotice({
          runId,
          phase: input.phase,
          attempt,
          maxRetries: streamMaxRetries,
          delayMs,
        });
        await this.delayUnlessCanceled(activeRun, delayMs);
        if (activeRun.canceled) {
          break;
        }
      }
    } finally {
      this.broker.unregisterRun(runId);
    }
    return { bridge, streamError, interruptState, costUsd };
  }

  /**
   * Synthesize the tool_end (status error) / subagent_stop that the dropped
   * socket never delivered, so the abandoned attempt's nodes close as failed
   * instead of lingering "running" and then rendering as a duplicate completed
   * branch once the retry's own nodes finish.
   */
  private async closeOrphanNodes(
    runId: string,
    openNodes: OpenNodeTracker,
  ): Promise<void> {
    const { store } = this.deps;
    for (const [toolUseId, toolName] of openNodes.tools) {
      await store.appendRunEvent({
        runId,
        type: "tool_end",
        payload: { toolName, status: "error", toolUseId },
      });
    }
    for (const agentId of openNodes.subagents) {
      await store.appendRunEvent({
        runId,
        type: "subagent_stop",
        payload: { agentId },
      });
    }
  }

  /** Sleep `ms`, resolving early if the run is canceled mid-backoff. */
  private delayUnlessCanceled(activeRun: ActiveRun, ms: number): Promise<void> {
    return new Promise((resolve) => {
      if (activeRun.canceled || ms <= 0) {
        resolve();
        return;
      }
      const start = Date.now();
      const timer = setInterval(() => {
        if (activeRun.canceled || Date.now() - start >= ms) {
          clearInterval(timer);
          resolve();
        }
      }, Math.min(200, ms));
    });
  }

  /** Durable "retrying after a connection drop" signal (run stays `running`). */
  private async emitRetryNotice(input: {
    runId: string;
    phase?: DeepPhase;
    attempt: number;
    maxRetries: number;
    delayMs: number;
  }): Promise<void> {
    await this.deps.store.appendRunEvent({
      runId: input.runId,
      type: "run_status",
      payload: {
        status: "running",
        retrying: true,
        attempt: input.attempt,
        maxRetries: input.maxRetries,
        delayMs: input.delayMs,
        ...(input.phase ? { phase: input.phase } : {}),
      },
    });
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

    // Per-run tool context (plan §5.1). The MCP server + citation counter are
    // rebuilt per stream attempt (a transient retry re-runs from scratch), so
    // keep the shared base here and stamp a fresh counter inside buildAttempt.
    const toolCtxBase = {
      runId,
      threadId: request.threadId,
      ownerUserId: request.ownerUserId,
      store,
      providers: this.providerDeps,
      broker: this.broker,
      sandbox: this.sandbox,
      config,
    };

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

    // A stable turnKey across retries lets a retried attempt's answer segments
    // overwrite the dead attempt's rows; the coordinator/bridge/options are
    // rebuilt per attempt (buildAttempt) so a transient connection drop re-runs
    // from scratch. The hooks wait on the per-attempt coordinator's barriers so
    // reasoning↔tool ordering stays precise (answer-stream Fase 1).
    const turnKey = randomUUID();
    const activeRun: ActiveRun = { runId, canceled: false };
    this.active.set(runId, activeRun);

    const buildAttempt = (openNodes: OpenNodeTracker): StreamAttempt => {
      const coordinator = new SegmentCoordinator();
      const abortController = new AbortController();
      const options = buildAstraQueryOptions({
        config,
        agentKind: request.agentKind,
        mode: request.mode,
        phase,
        resumeSessionId,
        mcpServer: buildAqshaMcpServer({
          ...toolCtxBase,
          nextCitationNumber: createCitationCounter(),
        }),
        hooks: buildRunHooks({
          store,
          runId,
          threadId: request.threadId,
          coordinator,
          openNodes,
        }),
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
        turnKey,
        coordinator,
      });
      return { options, bridge };
    };

    const outcome = await this.runStreamWithRetry({
      runId,
      prompt: assembled.prompt,
      activeRun,
      buildAttempt,
      // Resume after a tool approval: re-arm the recorded response before every
      // attempt so the model's retry of the gated tool resolves instead of
      // interrupting again (the broker drops the prime on unregister).
      prime: turn?.resumeInteraction
        ? () => this.broker.primeResolvedApproval(runId, turn.resumeInteraction!)
        : undefined,
      // Re-executing an approved side-effecting tool must not auto-retry (a
      // whole-turn replay would duplicate the artifact/workspace).
      allowRetry: !isApprovedToolApprovalResume(turn?.resumeInteraction),
    });
    const { bridge, streamError, interruptState } = outcome;
    this.active.delete(runId);

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
      // HITL pause: askUser or a tool approval. The question/approval becomes
      // the turn's response; the run stops here until the user replies.
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
      // interrupt firing and the run finalizing as waiting_hitl (the responder
      // only forwards a resume when it OBSERVES waiting_hitl).
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
        costUsd: outcome.costUsd || undefined,
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
      costUsd: outcome.costUsd || undefined,
      usage: result.summary.usage,
      numTurns: result.summary.numTurns,
    });
    await store.setThreadStatus(request.threadId, "idle");
    await store.appendRunEvent({
      runId,
      type: "run_status",
      payload: { status: "completed", costUsd: outcome.costUsd || undefined },
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
      // Initial dispatch: request.prompt is already the /deep-stripped question.
      return request.prompt;
    }
    // On resume, request.prompt is the resume instruction, NOT the question.
    // Read the CANONICAL question from durable state — never the last user
    // message, which after a plan decision is the materialized HITL bubble
    // ("Mulai riset dengan rencana ini.") and would poison every downstream
    // phase's `section("Research question", …)` (plan §4.6a).
    const messages = await this.deps.store.listMessages(request.threadId, 100);
    const stripDeep = (text: string): string =>
      text.startsWith("/deep") ? text.slice("/deep".length).trim() : text;
    // 1. The exact message that started this run.
    const run = await this.deps.store.getRun(request.runId);
    if (run?.promptMessageId) {
      const promptMessage = messages.find(
        (message) => message.messageId === run.promptMessageId,
      );
      const text = promptMessage?.text.trim();
      if (text) {
        return stripDeep(text);
      }
    }
    // 2. The EARLIEST user message that issued a /deep command (the original
    //    request precedes any materialized HITL bubble).
    const deepMessage = messages.find(
      (message) =>
        message.role === "user" && message.text.trim().startsWith("/deep"),
    );
    if (deepMessage) {
      return stripDeep(deepMessage.text.trim());
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

    // Replay idempotency (plan §4.6c): a durable re-dispatch WITHOUT a resume
    // (crash/watchdog retry) of an already-parked plan phase must re-park the
    // SAME card — running the phase again would open a second card and orphan the
    // first. A real resume (isResume) is handled by Branch B below. Done before
    // the assistant message is created so the re-park leaves no empty bubble.
    if (!isResume && states.plan?.status === "running") {
      const pending = await store.listPendingInteractionsByRun(runId);
      const card = pending.find(
        (interaction) => interaction.toolName === "proposeResearchPlan",
      );
      if (card) {
        await this.parkForPlanReview({
          runId,
          threadId: request.threadId,
          ownerUserId: request.ownerUserId,
          existing: card,
          sdkSessionId: states.plan.sdkSessionId,
          costUsd: states.plan.costUsd,
        });
        return;
      }
    }

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

    // Deep-research plan gate (plan §4.6b). A plan_decision resume is NOT a tool
    // approval the model retries — handle it here (Branch B). The resumed phase's
    // approved-tool response is (re-)primed per attempt inside the phase loop's
    // runStreamWithRetry call, not here, so it survives a transient retry.
    const planResume = resolvePlanDecision(turn?.resumeInteraction);
    if (planResume) {
      // Symmetric with all three decisions: close the old approval node so it
      // never hangs on "waiting_approval" (plan §8 node-timeline fix).
      const interactionId = turn!.resumeInteraction!.id;
      await store.appendRunEvent({
        runId,
        type: "interaction_resolved",
        payload: { interactionId, toolName: "proposeResearchPlan" },
      });
      if (planResume.decision === "reject") {
        // Mirror cancelRun ordering: finalize terminal first, then thread, then
        // event (the sticky service.finalizeRun wins a concurrent cancel race).
        await store.finalizeRun(runId, { status: "canceled" });
        await store.setThreadStatus(request.threadId, "idle");
        await store.appendRunEvent({
          runId,
          type: "run_status",
          payload: { status: "canceled", reason: "plan_rejected" },
        });
        await store.finalizeMessage(assistantMessage.messageId, {
          text: "Rencana riset ditolak. Kirim /deep lagi kapan saja untuk memulai ulang.",
          status: "complete",
        });
        this.active.delete(runId);
        return;
      }
      if (planResume.decision === "start") {
        // The approved plan (edited client-side, or the rendered original) becomes
        // the plan phase output — the source of truth every later phase reads.
        const planText =
          planResume.editedPlan ??
          renderResearchPlanMarkdown(
            parseResearchPlanPayload(turn!.resumeInteraction!.payload),
          );
        states.plan = await store.upsertResearchPhase({
          runId,
          phase: "plan",
          status: "done",
          output: planText,
        });
        await store.appendRunEvent({
          runId,
          type: "phase_done",
          payload: { phase: "plan", approved: true },
        });
        // Fall through: the loop skips the done plan phase and runs literature.
      }
      // revise: interaction_resolved already emitted; the plan stays NOT done.
      // The loop re-enters the plan phase (resumingThisPhase via the persisted
      // sdkSessionId) with the revision instruction injected, and the model
      // re-calls proposeResearchPlan → parks again via the interruptState branch.
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
        // phases always start fresh. Gate on the PARKED phase's status, not on
        // sdkSessionId: a parked phase is "running" (a fresh downstream phase is
        // undefined, a finished one "done" and already skipped). The session is
        // best-effort (resumeSessionId can be undefined), but the resume PROMPT —
        // which carries the askUser answers / plan revision instruction — must
        // always be injected, even when the SDK never surfaced a session_id.
        const resumingThisPhase =
          isResume && !resumeConsumed && existing?.status === "running";
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

        // Per-phase isolation: index the phase-keyed map so each phase only sees
        // its own subagent. plan/write (useSubagents:false) → undefined.
        const subagents = policy.useSubagents
          ? buildDeepResearchSubagents({ config, agentKind: request.agentKind })[phase]
          : undefined;
        // A stable turnKey across this phase's retries lets a retried attempt's
        // segments overwrite the dead attempt's rows; the coordinator/bridge/
        // options/MCP server are rebuilt per attempt so a transient connection
        // drop re-runs the phase from scratch (each phase is its own query()).
        const turnKey = randomUUID();
        const buildAttempt = (openNodes: OpenNodeTracker): StreamAttempt => {
          const coordinator = new SegmentCoordinator();
          const abortController = new AbortController();
          const options = buildAstraQueryOptions({
            config,
            agentKind: request.agentKind,
            mode: "deep",
            phase: turnPhase,
            resumeSessionId: resumingThisPhase ? existing?.sdkSessionId : undefined,
            mcpServer: buildAqshaMcpServer({
              runId,
              threadId: request.threadId,
              ownerUserId: request.ownerUserId,
              store,
              providers: this.providerDeps,
              broker: this.broker,
              sandbox: this.sandbox,
              config,
              nextCitationNumber: createCitationCounter(),
            }),
            hooks: buildRunHooks({
              store,
              runId,
              threadId: request.threadId,
              coordinator,
              openNodes,
            }),
            canUseTool: buildCanUseTool({
              broker: this.broker,
              runId,
              threadId: request.threadId,
              ownerUserId: request.ownerUserId,
            }),
            agents: subagents,
            abortController,
            maxTurnsOverride: policy.maxTurns,
          });
          const bridge = new StreamBridge(store, {
            runId,
            threadId: request.threadId,
            messageId: assistantMessage.messageId,
            flushMs: config.streamFlushMs,
            flushChars: config.streamFlushChars,
            turnKey,
            coordinator,
            silent: !policy.streamsToChat,
          });
          return { options, bridge };
        };

        const outcome = await this.runStreamWithRetry({
          runId,
          prompt,
          activeRun,
          buildAttempt,
          // Re-arm the resumed phase's approved-tool response before each attempt
          // (no-op unless it is a primeable tool_approval; the broker guards it).
          prime:
            resumingThisPhase && turn?.resumeInteraction
              ? () => this.broker.primeResolvedApproval(runId, turn.resumeInteraction!)
              : undefined,
          // A resumed write-phase artifact approval must not auto-retry (duplicate).
          allowRetry: !(
            resumingThisPhase && isApprovedToolApprovalResume(turn?.resumeInteraction)
          ),
          phase,
        });
        const { bridge, streamError, interruptState } = outcome;

        await bridge.flush();
        const result = bridge.result();
        dispatchCostUsd += outcome.costUsd;

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
            costUsd: sumCost(existing?.costUsd, outcome.costUsd),
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

        // A phase that ended in error degrades to done-partial (continue the run)
        // instead of hard-failing when EITHER a max-turns stop left usable text,
        // OR the phase is an optional quality gate (counter-evidence / citation
        // verification) — those must never kill the run, even when a transient
        // fault exhausted their retries (the writer proceeds with a caveat).
        const phaseFailed = Boolean(
          streamError || (result.resultSubtype && result.resultSubtype !== "success"),
        );
        const maxTurnsStop = isMaxTurnsStop({
          streamError,
          resultSubtype: result.resultSubtype,
        });
        const degradeToPartial =
          phaseFailed &&
          ((maxTurnsStop && result.finalText.trim().length > 0) ||
            policy.optional === true);

        if (phaseFailed && !degradeToPartial) {
          const message = streamError ?? `phase ${phase}: ${result.resultSubtype}`;
          await store.upsertResearchPhase({
            runId,
            phase,
            status: "failed",
            costUsd: sumCost(existing?.costUsd, outcome.costUsd),
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

        // Fallback (plan §4.6d): the plan phase finished WITHOUT the model
        // calling proposeResearchPlan, so the gate would otherwise leak silently
        // and the run would barrel into literature. Park manually for plan
        // review from the model's free-text plan. The per-phase finally already
        // ran broker.unregisterRun, so a broker call here is a no-op — this MUST
        // be a manual park (DRY with replay via parkForPlanReview).
        if (phase === "plan") {
          await this.parkForPlanReview({
            runId,
            threadId: request.threadId,
            ownerUserId: request.ownerUserId,
            assistantMessageId: assistantMessage.messageId,
            finalText: result.finalText,
            sdkSessionId: result.sessionId,
            costUsd: sumCost(existing?.costUsd, outcome.costUsd),
            payload: {
              title: question,
              summary: "",
              questions: extractPlanQuestions(result.finalText),
            },
          });
          return;
        }

        const doneState = await store.upsertResearchPhase({
          runId,
          phase,
          status: "done",
          output: result.finalText.trim() || PHASE_BUDGET_EXHAUSTED_NOTE,
          sdkSessionId: result.sessionId,
          costUsd: sumCost(existing?.costUsd, outcome.costUsd),
        });
        states[phase] = doneState;
        await store.appendRunEvent({
          runId,
          type: "phase_done",
          payload: { phase, costUsd: outcome.costUsd || undefined },
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

  /**
   * Park a /deep run at the plan-review gate (plan §4.6d). Shared by the no-tool
   * FALLBACK (`payload` → create a fresh card) and the durable REPLAY re-park
   * (`existing` → re-park the still-pending card). Replicates the interruptState
   * branch's persist-session → finalize → park → race-guard sequence. The caller
   * returns inside the executeDeepRun try, so the outer finally clears
   * `active`/broker — this method does NOT touch them.
   */
  private async parkForPlanReview(input: {
    runId: string;
    threadId: string;
    ownerUserId: string;
    sdkSessionId?: string;
    costUsd?: number;
    /** Fresh in-flight assistant message to finalize (fallback only). */
    assistantMessageId?: string;
    finalText?: string;
    /** Re-park this already-pending card (replay) — skips create + pending event. */
    existing?: PendingInteraction;
    /** Create a new card from this payload (fallback). */
    payload?: Record<string, unknown>;
  }): Promise<void> {
    const { store } = this.deps;
    let interaction = input.existing;
    if (!interaction) {
      interaction = await store.createInteraction({
        ownerUserId: input.ownerUserId,
        threadId: input.threadId,
        runId: input.runId,
        type: "tool_approval",
        toolName: "proposeResearchPlan",
        payload: input.payload ?? {},
      });
      await store.appendRunEvent({
        runId: input.runId,
        type: "interaction_pending",
        payload: { interactionId: interaction.id, toolName: "proposeResearchPlan" },
      });
    }
    await store.upsertResearchPhase({
      runId: input.runId,
      phase: "plan",
      status: "running",
      sdkSessionId: input.sdkSessionId,
      costUsd: input.costUsd,
    });
    if (input.assistantMessageId) {
      await store.finalizeMessage(input.assistantMessageId, {
        text: input.finalText ?? "",
        status: "complete",
      });
    }
    await store.finalizeRun(input.runId, { status: "waiting_hitl" });
    await store.setThreadStatus(input.threadId, "idle");
    await store.appendRunEvent({
      runId: input.runId,
      type: "run_status",
      payload: {
        status: "waiting_hitl",
        phase: "plan",
        reason: "plan_review",
        interactionId: interaction.id,
      },
    });
    // Respond-while-finalizing race guard (mirror the interruptState branch):
    // if the user already responded in the window, resume now.
    const latest = await store.getInteraction(interaction.id);
    if (latest?.status === "responded") {
      void this.resumeRun(input.runId, interaction.id);
    }
  }

}

function sumCost(...values: Array<number | undefined>): number | undefined {
  const total = values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  return total > 0 ? total : undefined;
}

/**
 * True when a resume re-executes an APPROVED, side-effecting tool (proposeArtifact
 * → executeArtifact, createWorkspace, …). Such a turn must NOT auto-retry on a
 * transient drop: a whole-turn replay re-runs the approved action and — since
 * executeArtifact has no idempotency guard — would mint a duplicate. An ask_user
 * answer or a denied approval has no side effect and stays retriable.
 */
function isApprovedToolApprovalResume(interaction?: PendingInteraction): boolean {
  return (
    interaction?.type === "tool_approval" &&
    interaction.response?.kind === "approval" &&
    interaction.response.approved === true
  );
}

/**
 * Narrow a resumed interaction to a deep-research plan decision (plan §4.6b).
 * Returns null unless it is a responded `proposeResearchPlan` tool_approval
 * carrying a `plan_decision` response — so a regular tool approval, an ask_user
 * answer, or a durable replay (no resume) all fall through to the normal path.
 */
function resolvePlanDecision(interaction?: PendingInteraction): {
  decision: "start" | "revise" | "reject";
  editedPlan?: string;
  revisionInstruction?: string;
} | null {
  if (
    !interaction ||
    interaction.toolName !== "proposeResearchPlan" ||
    interaction.status !== "responded" ||
    interaction.response?.kind !== "plan_decision"
  ) {
    return null;
  }
  const { decision, editedPlan, revisionInstruction } = interaction.response;
  return { decision, editedPlan, revisionInstruction };
}

/**
 * Best-effort sub-question extraction from a model's free-text plan, used only
 * by the no-tool FALLBACK gate (plan §4.6d). Keeps numbered/bulleted list items,
 * strips the marker, and caps at 6. Returns [] when no list is found — the card
 * then renders title-only via parseResearchPlanPayload's fallback.
 */
function extractPlanQuestions(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^(\d+[.)]|[-*])\s+/.test(line))
    .map((line) => line.replace(/^(\d+[.)]|[-*])\s+/, "").trim())
    .filter(Boolean)
    .slice(0, 6);
}

/** Generate a run id when the caller (dev tools) does not provide one. */
export function newRunId(): string {
  return `run_${randomUUID()}`;
}

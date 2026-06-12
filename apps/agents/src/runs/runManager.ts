import { randomUUID } from "node:crypto";
import type { PendingInteraction, RunRequest } from "@aqsha/agent-contracts";
import {
  buildAstraQueryOptions,
  type AstraQueryOptions,
} from "../agent/astra";
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
import { buildDeepResearchAgents } from "../subagents";
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
      buildSandboxService({ daytonaApiKey: deps.config.providers.daytonaApiKey });
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
    const active = this.active.get(runId);
    if (active) {
      active.canceled = true;
      try {
        await active.handle?.interrupt();
      } catch {
        // Already finished — fall through to status update.
      }
    }
    const run = await this.deps.store.getRun(runId);
    if (!run) {
      return { ok: false };
    }
    if (["completed", "failed", "canceled"].includes(run.status)) {
      return { ok: true };
    }
    await this.deps.store.finalizeRun(runId, { status: "canceled" });
    await this.deps.store.setThreadStatus(run.threadId, "idle");
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
      await this.executeTurn(request, options);
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
    await store.appendRunEvent({
      runId: request.runId,
      type: "error",
      payload: { message },
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

    const deepAgents =
      request.mode === "deep"
        ? buildDeepResearchAgents({
            config,
            agentKind: request.agentKind,
            writerSkill: selectDomainPack(
              assembled.prompt,
              readSkillEntries(config.appRoot),
            ),
          })
        : undefined;

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
      agents: deepAgents,
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
        payload: { message: streamError ?? result.resultSubtype },
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

}

/** Generate a run id when the caller (dev tools) does not provide one. */
export function newRunId(): string {
  return `run_${randomUUID()}`;
}

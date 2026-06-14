import { randomUUID } from "node:crypto";
import type {
  InteractionResponse,
  PendingInteraction,
  ResearchPhaseState,
  RunResultSummary,
} from "@aqsha/agent-contracts";
import type {
  AgentStore,
  ArtifactAction,
  ArtifactSnapshot,
  CreateInteractionInput,
  MessageRecord,
  RunEventRecord,
  RunRecord,
  ThreadRecord,
  WorkspaceAction,
  WorkspaceManifest,
} from "./types";

// In-memory AgentStore: the dev/test backend and the reference semantics for
// the Convex implementation. Single-process only by design.

type WorkspaceRecord = { workspaceId: string; ownerUserId: string; name: string; emoji?: string };

export class MemoryStore implements AgentStore {
  private threads = new Map<string, ThreadRecord>();
  private messages = new Map<string, MessageRecord>();
  private runs = new Map<string, RunRecord>();
  private runEvents = new Map<string, RunEventRecord[]>();
  // runId → segmentId → the (mutable) event record, so an answer-segment upsert
  // patches the existing row in place and keeps its seq (mirrors the Convex
  // `by_run_segment` lookup).
  private runEventSegments = new Map<string, Map<string, RunEventRecord>>();
  private interactions = new Map<string, PendingInteraction>();
  private interactionWaiters = new Map<string, Array<(row: PendingInteraction) => void>>();
  private artifacts = new Map<string, ArtifactSnapshot & { ownerUserId: string; deleted?: boolean }>();
  private workspaces = new Map<string, WorkspaceRecord>();
  private researchPhases = new Map<string, ResearchPhaseState>();

  constructor(private readonly now: () => number = Date.now) {}

  // ── threads ────────────────────────────────────────────────────────────────

  async getThread(threadId: string): Promise<ThreadRecord | null> {
    return this.threads.get(threadId) ?? null;
  }

  async upsertThread(input: {
    threadId: string;
    ownerUserId: string;
    agentKind: ThreadRecord["agentKind"];
    workspaceId?: string;
  }): Promise<ThreadRecord> {
    const existing = this.threads.get(input.threadId);
    if (existing) {
      existing.agentKind = input.agentKind;
      existing.lastActivityAt = this.now();
      return existing;
    }
    const thread: ThreadRecord = {
      threadId: input.threadId,
      ownerUserId: input.ownerUserId,
      workspaceId: input.workspaceId,
      status: "idle",
      agentKind: input.agentKind,
      lastActivityAt: this.now(),
      messageCount: 0,
    };
    this.threads.set(thread.threadId, thread);
    return thread;
  }

  async setThreadSession(threadId: string, sdkSessionId: string): Promise<void> {
    const thread = this.threads.get(threadId);
    if (thread) {
      thread.sdkSessionId = sdkSessionId;
    }
  }

  async setThreadStatus(
    threadId: string,
    status: ThreadRecord["status"],
  ): Promise<void> {
    const thread = this.threads.get(threadId);
    if (thread) {
      thread.status = status;
      thread.lastActivityAt = this.now();
    }
  }

  // ── messages ───────────────────────────────────────────────────────────────

  async createMessage(input: {
    threadId: string;
    ownerUserId: string;
    role: MessageRecord["role"];
    text: string;
    runId?: string;
    status: MessageRecord["status"];
  }): Promise<MessageRecord> {
    const message: MessageRecord = {
      messageId: `msg_${randomUUID()}`,
      threadId: input.threadId,
      ownerUserId: input.ownerUserId,
      role: input.role,
      text: input.text,
      runId: input.runId,
      status: input.status,
      createdAt: this.now(),
    };
    this.messages.set(message.messageId, message);
    const thread = this.threads.get(input.threadId);
    if (thread) {
      thread.messageCount += 1;
      thread.lastActivityAt = message.createdAt;
    }
    return message;
  }

  async updateMessageText(
    messageId: string,
    text: string,
    reasoning?: string,
  ): Promise<void> {
    const message = this.messages.get(messageId);
    if (message) {
      message.text = text;
      if (reasoning !== undefined) {
        message.reasoning = reasoning;
      }
    }
  }

  async finalizeMessage(
    messageId: string,
    input: { text: string; status: "complete" | "error" },
  ): Promise<void> {
    const message = this.messages.get(messageId);
    if (message) {
      message.text = input.text;
      message.status = input.status;
    }
  }

  async listMessages(threadId: string, limit: number): Promise<MessageRecord[]> {
    return [...this.messages.values()]
      .filter((message) => message.threadId === threadId)
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(-limit);
  }

  // ── runs ───────────────────────────────────────────────────────────────────

  async createRun(input: {
    runId: string;
    threadId: string;
    ownerUserId: string;
    agentKind: RunRecord["agentKind"];
    mode: RunRecord["mode"];
    promptMessageId?: string;
  }): Promise<RunRecord> {
    const run: RunRecord = {
      runId: input.runId,
      threadId: input.threadId,
      ownerUserId: input.ownerUserId,
      promptMessageId: input.promptMessageId,
      status: "queued",
      mode: input.mode,
      agentKind: input.agentKind,
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    this.runs.set(run.runId, run);
    return run;
  }

  async getRun(runId: string): Promise<RunRecord | null> {
    return this.runs.get(runId) ?? null;
  }

  async setRunStatus(runId: string, status: RunRecord["status"]): Promise<void> {
    const run = this.runs.get(runId);
    if (run) {
      run.status = status;
      run.updatedAt = this.now();
    }
  }

  async finalizeRun(runId: string, summary: RunResultSummary): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) {
      return;
    }
    run.status = summary.status;
    run.sdkSessionId = summary.sdkSessionId ?? run.sdkSessionId;
    run.costUsd = summary.costUsd ?? run.costUsd;
    run.usageJson = summary.usage ? JSON.stringify(summary.usage) : run.usageJson;
    run.numTurns = summary.numTurns ?? run.numTurns;
    run.errorMessage = summary.errorMessage ?? run.errorMessage;
    run.updatedAt = this.now();
  }

  async setRunVerificationReport(
    runId: string,
    verificationReportJson: string,
  ): Promise<void> {
    const run = this.runs.get(runId);
    if (run) {
      run.verificationReportJson = verificationReportJson;
      run.updatedAt = this.now();
    }
  }

  async appendRunEvent(input: {
    runId: string;
    type: RunEventRecord["type"];
    payload: Record<string, unknown>;
  }): Promise<RunEventRecord> {
    const events = this.runEvents.get(input.runId) ?? [];
    const event: RunEventRecord = {
      runId: input.runId,
      seq: events.length,
      type: input.type,
      payloadJson: JSON.stringify(input.payload),
      createdAt: this.now(),
    };
    events.push(event);
    this.runEvents.set(input.runId, events);
    return event;
  }

  async upsertRunEventBySegmentId(input: {
    runId: string;
    segmentId: string;
    type: RunEventRecord["type"];
    payload: Record<string, unknown>;
  }): Promise<RunEventRecord> {
    const segments = this.runEventSegments.get(input.runId) ?? new Map();
    const existing = segments.get(input.segmentId);
    if (existing) {
      // Patch in place: keep seq + createdAt, refresh the (grown) payload.
      existing.payloadJson = JSON.stringify(input.payload);
      return existing;
    }
    const events = this.runEvents.get(input.runId) ?? [];
    const event: RunEventRecord = {
      runId: input.runId,
      seq: events.length,
      type: input.type,
      payloadJson: JSON.stringify(input.payload),
      createdAt: this.now(),
    };
    events.push(event);
    this.runEvents.set(input.runId, events);
    segments.set(input.segmentId, event);
    this.runEventSegments.set(input.runId, segments);
    return event;
  }

  async listRunEvents(runId: string): Promise<RunEventRecord[]> {
    return [...(this.runEvents.get(runId) ?? [])];
  }

  // ── interactions ───────────────────────────────────────────────────────────

  async createInteraction(input: CreateInteractionInput): Promise<PendingInteraction> {
    const interaction: PendingInteraction = {
      id: `int_${randomUUID()}`,
      ownerUserId: input.ownerUserId,
      threadId: input.threadId,
      runId: input.runId,
      type: input.type,
      toolName: input.toolName,
      toolUseId: input.toolUseId,
      payload: input.payload,
      status: "pending",
      createdAt: this.now(),
    };
    this.interactions.set(interaction.id, interaction);
    return interaction;
  }

  async getInteraction(interactionId: string): Promise<PendingInteraction | null> {
    return this.interactions.get(interactionId) ?? null;
  }

  async respondInteraction(
    interactionId: string,
    response: InteractionResponse,
  ): Promise<PendingInteraction | null> {
    const interaction = this.interactions.get(interactionId);
    if (!interaction || interaction.status !== "pending") {
      return null;
    }
    interaction.status = "responded";
    interaction.response = response;
    interaction.respondedAt = this.now();
    const waiters = this.interactionWaiters.get(interactionId) ?? [];
    this.interactionWaiters.delete(interactionId);
    for (const resolve of waiters) {
      resolve(interaction);
    }
    return interaction;
  }

  async expireInteraction(interactionId: string): Promise<void> {
    const interaction = this.interactions.get(interactionId);
    if (interaction && interaction.status === "pending") {
      interaction.status = "expired";
    }
  }

  async waitForResponse(
    interactionId: string,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<PendingInteraction | null> {
    const existing = this.interactions.get(interactionId);
    if (!existing) {
      return null;
    }
    if (existing.status === "responded") {
      return existing;
    }
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value: PendingInteraction | null) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        resolve(value);
      };
      const timer = setTimeout(() => finish(null), timeoutMs);
      const onAbort = () => finish(null);
      signal?.addEventListener("abort", onAbort, { once: true });
      const waiters = this.interactionWaiters.get(interactionId) ?? [];
      waiters.push((row) => finish(row));
      this.interactionWaiters.set(interactionId, waiters);
    });
  }

  async listInteractions(threadId: string): Promise<PendingInteraction[]> {
    return [...this.interactions.values()]
      .filter((interaction) => interaction.threadId === threadId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  // ── context data ───────────────────────────────────────────────────────────

  /** Test/dev helper: seed an artifact the agent can reference. */
  seedArtifact(artifact: ArtifactSnapshot & { ownerUserId: string }): void {
    this.artifacts.set(artifact.artifactId, artifact);
  }

  /** Test/dev helper: seed a workspace. */
  seedWorkspace(workspace: WorkspaceRecord): void {
    this.workspaces.set(workspace.workspaceId, workspace);
  }

  async listContextArtifacts(
    _threadId: string,
    artifactIds: string[],
  ): Promise<ArtifactSnapshot[]> {
    return artifactIds
      .map((artifactId) => this.artifacts.get(artifactId))
      .filter((artifact): artifact is ArtifactSnapshot & { ownerUserId: string } =>
        Boolean(artifact && !artifact.deleted),
      )
      .map(({ ownerUserId: _owner, ...artifact }) => artifact);
  }

  async getArtifact(artifactId: string): Promise<ArtifactSnapshot | null> {
    const artifact = this.artifacts.get(artifactId);
    if (!artifact || artifact.deleted) {
      return null;
    }
    const { ownerUserId: _owner, deleted: _deleted, ...snapshot } = artifact;
    return snapshot;
  }

  async getWorkspaceManifests(
    ownerUserId: string,
    workspaceIds: string[],
  ): Promise<WorkspaceManifest[]> {
    return workspaceIds
      .map((workspaceId) => this.workspaces.get(workspaceId))
      .filter((workspace): workspace is WorkspaceRecord =>
        Boolean(workspace && workspace.ownerUserId === ownerUserId),
      )
      .map((workspace) => ({
        workspaceId: workspace.workspaceId,
        name: workspace.name,
        items: [...this.artifacts.values()]
          .filter(
            (artifact) =>
              artifact.workspaceId === workspace.workspaceId && !artifact.deleted,
          )
          .map((artifact) => ({ artifactId: artifact.artifactId, title: artifact.title })),
      }));
  }

  async searchThreadDocuments(threadId: string, query: string): Promise<string> {
    // Naive scan over seeded artifacts; the Convex store delegates to RAG.
    const terms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
    const hits = [...this.artifacts.values()]
      .filter((artifact) => !artifact.deleted)
      .map((artifact) => {
        const text = `${artifact.title}\n${artifact.text}`.toLowerCase();
        const score = terms.filter((term) => text.includes(term)).length;
        return { artifact, score };
      })
      .filter((hit) => hit.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
    if (hits.length === 0) {
      return "No matching thread documents were found.";
    }
    return hits
      .map(
        (hit) =>
          `## ${hit.artifact.title} (Artifact ID: ${hit.artifact.artifactId})\n${hit.artifact.text.slice(0, 1_500)}`,
      )
      .join("\n\n");
  }

  // ── HITL writes ────────────────────────────────────────────────────────────

  async applyArtifactAction(
    ownerUserId: string,
    _threadId: string,
    action: ArtifactAction,
  ): Promise<{ ok: boolean; artifactId?: string; reason?: string }> {
    if (action.action === "delete") {
      const artifact = this.artifacts.get(action.artifactId);
      if (!artifact || artifact.ownerUserId !== ownerUserId) {
        return { ok: false, reason: "Artifact not found" };
      }
      artifact.deleted = true;
      return { ok: true, artifactId: action.artifactId };
    }
    if (action.action === "update") {
      const artifactId = action.artifactId;
      const artifact = artifactId ? this.artifacts.get(artifactId) : undefined;
      if (!artifact || artifact.ownerUserId !== ownerUserId) {
        return { ok: false, reason: "Artifact not found" };
      }
      artifact.title = action.title;
      artifact.text = action.content;
      artifact.artifactType = action.artifactType ?? artifact.artifactType;
      return { ok: true, artifactId: artifact.artifactId };
    }
    const artifactId = `art_${randomUUID()}`;
    this.artifacts.set(artifactId, {
      artifactId,
      ownerUserId,
      title: action.title,
      artifactType: action.artifactType,
      text: action.content,
      workspaceId: action.workspaceId,
    });
    return { ok: true, artifactId };
  }

  async applyWorkspaceAction(
    ownerUserId: string,
    action: WorkspaceAction,
  ): Promise<{ ok: boolean; workspaceId?: string; reason?: string }> {
    if (action.action === "create") {
      const workspaceId = `ws_${randomUUID()}`;
      this.workspaces.set(workspaceId, {
        workspaceId,
        ownerUserId,
        name: action.name,
        emoji: action.emoji,
      });
      return { ok: true, workspaceId };
    }
    const workspace = this.workspaces.get(action.workspaceId);
    if (!workspace || workspace.ownerUserId !== ownerUserId) {
      return { ok: false, reason: "Workspace not found" };
    }
    workspace.name = action.name;
    return { ok: true, workspaceId: workspace.workspaceId };
  }

  // ── deep-research phase state ──────────────────────────────────────────────

  async upsertResearchPhase(input: {
    runId: string;
    phase: ResearchPhaseState["phase"];
    status: ResearchPhaseState["status"];
    output?: string;
    sdkSessionId?: string;
    costUsd?: number;
  }): Promise<ResearchPhaseState> {
    const key = `${input.runId}:${input.phase}`;
    const existing = this.researchPhases.get(key);
    const state: ResearchPhaseState = {
      runId: input.runId,
      phase: input.phase,
      status: input.status,
      output: input.output ?? existing?.output,
      sdkSessionId: input.sdkSessionId ?? existing?.sdkSessionId,
      costUsd: input.costUsd ?? existing?.costUsd,
      createdAt: existing?.createdAt ?? this.now(),
      updatedAt: this.now(),
    };
    this.researchPhases.set(key, state);
    return state;
  }

  async listResearchPhases(runId: string): Promise<ResearchPhaseState[]> {
    return [...this.researchPhases.values()]
      .filter((state) => state.runId === runId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }
}

import type {
  AgentKind,
  InteractionResponse,
  InteractionType,
  PendingInteraction,
  ResearchPhaseState,
  RunEventType,
  RunMode,
  RunResultSummary,
  RunStatus,
} from "@aqsha/agent-contracts";

// Storage abstraction over the first-party tables (plan §4.5). The service
// only ever talks to this interface; backends are the in-memory store (dev,
// tests, Phase-0 spikes) and the Convex store (production, once the first-party
// schema lands in packages/convex).

export type ThreadRecord = {
  threadId: string;
  ownerUserId: string;
  title?: string;
  workspaceId?: string;
  status: "idle" | "streaming" | "failed";
  sdkSessionId?: string;
  agentKind: AgentKind;
  lastActivityAt: number;
  messageCount: number;
};

export type MessageRole = "user" | "assistant" | "system";
export type MessageStatus = "streaming" | "complete" | "error";

export type MessageRecord = {
  messageId: string;
  threadId: string;
  ownerUserId: string;
  role: MessageRole;
  text: string;
  /** Captured extended-thinking/reasoning stream (assistant messages only). */
  reasoning?: string;
  runId?: string;
  status: MessageStatus;
  createdAt: number;
};

export type RunRecord = {
  runId: string;
  threadId: string;
  ownerUserId: string;
  promptMessageId?: string;
  status: RunStatus;
  mode: RunMode;
  agentKind: AgentKind;
  sdkSessionId?: string;
  costUsd?: number;
  usageJson?: string;
  numTurns?: number;
  errorMessage?: string;
  verificationReportJson?: string;
  createdAt: number;
  updatedAt: number;
};

export type RunEventRecord = {
  runId: string;
  seq: number;
  type: RunEventType;
  payloadJson: string;
  createdAt: number;
};

export type ArtifactSnapshot = {
  artifactId: string;
  title: string;
  artifactType?: string;
  text: string;
  workspaceId?: string;
};

export type WorkspaceManifest = {
  workspaceId: string;
  name: string;
  items: Array<{ artifactId: string; title: string }>;
};

export type ArtifactAction =
  | {
      action: "create" | "update";
      artifactId?: string;
      workspaceId?: string;
      title: string;
      artifactType?: string;
      content: string;
    }
  | { action: "delete"; artifactId: string };

export type WorkspaceAction =
  | { action: "create"; name: string; emoji?: string }
  | { action: "rename"; workspaceId: string; name: string };

export type CreateInteractionInput = {
  ownerUserId: string;
  threadId: string;
  runId: string;
  type: InteractionType;
  toolName: string;
  toolUseId?: string;
  payload: Record<string, unknown>;
};

export interface AgentStore {
  // ── threads ──────────────────────────────────────────────────────────────
  getThread(threadId: string): Promise<ThreadRecord | null>;
  upsertThread(input: {
    threadId: string;
    ownerUserId: string;
    agentKind: AgentKind;
    workspaceId?: string;
  }): Promise<ThreadRecord>;
  setThreadSession(threadId: string, sdkSessionId: string): Promise<void>;
  setThreadStatus(threadId: string, status: ThreadRecord["status"]): Promise<void>;

  // ── messages ─────────────────────────────────────────────────────────────
  createMessage(input: {
    threadId: string;
    ownerUserId: string;
    role: MessageRole;
    text: string;
    runId?: string;
    status: MessageStatus;
  }): Promise<MessageRecord>;
  /**
   * Persist the in-flight assistant message. `reasoning` is the optional
   * extended-thinking stream; pass `undefined` to leave any stored reasoning
   * untouched (it only ever grows during a turn).
   */
  updateMessageText(messageId: string, text: string, reasoning?: string): Promise<void>;
  finalizeMessage(
    messageId: string,
    input: { text: string; status: Extract<MessageStatus, "complete" | "error"> },
  ): Promise<void>;
  listMessages(threadId: string, limit: number): Promise<MessageRecord[]>;

  // ── runs ─────────────────────────────────────────────────────────────────
  createRun(input: {
    runId: string;
    threadId: string;
    ownerUserId: string;
    agentKind: AgentKind;
    mode: RunMode;
    promptMessageId?: string;
  }): Promise<RunRecord>;
  getRun(runId: string): Promise<RunRecord | null>;
  setRunStatus(runId: string, status: RunStatus): Promise<void>;
  finalizeRun(runId: string, summary: RunResultSummary): Promise<void>;
  /** Persist a statistical-verification report on the run (plan §5.6). */
  setRunVerificationReport(runId: string, verificationReportJson: string): Promise<void>;
  appendRunEvent(input: {
    runId: string;
    type: RunEventType;
    payload: Record<string, unknown>;
  }): Promise<RunEventRecord>;
  listRunEvents(runId: string): Promise<RunEventRecord[]>;

  // ── interactions (HITL, plan §5.3) ───────────────────────────────────────
  createInteraction(input: CreateInteractionInput): Promise<PendingInteraction>;
  getInteraction(interactionId: string): Promise<PendingInteraction | null>;
  respondInteraction(
    interactionId: string,
    response: InteractionResponse,
  ): Promise<PendingInteraction | null>;
  expireInteraction(interactionId: string): Promise<void>;
  /**
   * Wait for a pending interaction to be responded to, up to timeoutMs.
   * Resolves with the responded row, or null when the window elapses.
   */
  waitForResponse(
    interactionId: string,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<PendingInteraction | null>;
  listInteractions(threadId: string): Promise<PendingInteraction[]>;

  // ── context data (RAG + manifests stay Convex-owned; memory store fakes) ─
  listContextArtifacts(
    threadId: string,
    artifactIds: string[],
  ): Promise<ArtifactSnapshot[]>;
  getArtifact(artifactId: string): Promise<ArtifactSnapshot | null>;
  getWorkspaceManifests(
    ownerUserId: string,
    workspaceIds: string[],
  ): Promise<WorkspaceManifest[]>;
  searchThreadDocuments(threadId: string, query: string): Promise<string>;

  // ── HITL writes ──────────────────────────────────────────────────────────
  applyArtifactAction(
    ownerUserId: string,
    threadId: string,
    action: ArtifactAction,
  ): Promise<{ ok: boolean; artifactId?: string; reason?: string }>;
  applyWorkspaceAction(
    ownerUserId: string,
    action: WorkspaceAction,
  ): Promise<{ ok: boolean; workspaceId?: string; reason?: string }>;

  // ── deep-research phase state (plan §5.5 durable orchestration) ──────────
  upsertResearchPhase(input: {
    runId: string;
    phase: ResearchPhaseState["phase"];
    status: ResearchPhaseState["status"];
    output?: string;
    sdkSessionId?: string;
    costUsd?: number;
  }): Promise<ResearchPhaseState>;
  listResearchPhases(runId: string): Promise<ResearchPhaseState[]>;
}

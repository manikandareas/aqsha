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

// Convex-backed AgentStore. This is the service side of the Phase-1 contract:
// packages/convex exposes service endpoints under `agent/service.ts`
// (api.agent.service.*) that validate the shared service token and read/write
// the first-party tables of plan §4.5. The function paths below ARE that
// contract — implement them in packages/convex with matching args.
//
// The client is injected as a minimal interface (rather than ConvexHttpClient
// directly) so tests can stub it and so the auth wrapper stays in one place.

export type ConvexCaller = {
  query(path: string, args: Record<string, unknown>): Promise<unknown>;
  mutation(path: string, args: Record<string, unknown>): Promise<unknown>;
  action(path: string, args: Record<string, unknown>): Promise<unknown>;
};

export const SERVICE_FUNCTIONS = {
  getThread: "agent/service:getThread",
  upsertThread: "agent/service:upsertThread",
  setThreadSession: "agent/service:setThreadSession",
  setThreadStatus: "agent/service:setThreadStatus",
  createMessage: "agent/service:createMessage",
  updateMessageText: "agent/service:updateMessageText",
  finalizeMessage: "agent/service:finalizeMessage",
  listMessages: "agent/service:listMessages",
  createRun: "agent/service:createRun",
  getRun: "agent/service:getRun",
  setRunStatus: "agent/service:setRunStatus",
  finalizeRun: "agent/service:finalizeRun",
  appendRunEvent: "agent/service:appendRunEvent",
  listRunEvents: "agent/service:listRunEvents",
  createInteraction: "agent/service:createInteraction",
  getInteraction: "agent/service:getInteraction",
  respondInteraction: "agent/service:respondInteraction",
  expireInteraction: "agent/service:expireInteraction",
  listInteractions: "agent/service:listInteractions",
  listContextArtifacts: "agent/service:listContextArtifacts",
  getArtifact: "agent/service:getArtifact",
  getWorkspaceManifests: "agent/service:getWorkspaceManifests",
  searchThreadDocuments: "agent/service:searchThreadDocuments",
  applyArtifactAction: "agent/service:applyArtifactAction",
  applyWorkspaceAction: "agent/service:applyWorkspaceAction",
  // Step 4 (additive): durable deep-research phase state (plan §5.5).
  upsertResearchPhase: "agent/service:upsertResearchPhase",
  listResearchPhases: "agent/service:listResearchPhases",
  // Step 5 (additive): statistical-verification report persistence (§5.6).
  setRunVerificationReport: "agent/service:setRunVerificationReport",
} as const;

const RESPONSE_POLL_MS = 1_500;

export class ConvexStore implements AgentStore {
  constructor(
    private readonly caller: ConvexCaller,
    private readonly serviceToken: string,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
    private readonly now: () => number = Date.now,
  ) {}

  private withAuth(args: Record<string, unknown>): Record<string, unknown> {
    return { ...args, serviceToken: this.serviceToken };
  }

  private query<T>(path: string, args: Record<string, unknown>): Promise<T> {
    return this.caller.query(path, this.withAuth(args)) as Promise<T>;
  }

  private mutation<T>(path: string, args: Record<string, unknown>): Promise<T> {
    return this.caller.mutation(path, this.withAuth(args)) as Promise<T>;
  }

  private action<T>(path: string, args: Record<string, unknown>): Promise<T> {
    return this.caller.action(path, this.withAuth(args)) as Promise<T>;
  }

  getThread(threadId: string): Promise<ThreadRecord | null> {
    return this.query(SERVICE_FUNCTIONS.getThread, { threadId });
  }

  upsertThread(input: {
    threadId: string;
    ownerUserId: string;
    agentKind: ThreadRecord["agentKind"];
    workspaceId?: string;
  }): Promise<ThreadRecord> {
    return this.mutation(SERVICE_FUNCTIONS.upsertThread, input);
  }

  async setThreadSession(threadId: string, sdkSessionId: string): Promise<void> {
    await this.mutation(SERVICE_FUNCTIONS.setThreadSession, { threadId, sdkSessionId });
  }

  async setThreadStatus(
    threadId: string,
    status: ThreadRecord["status"],
  ): Promise<void> {
    await this.mutation(SERVICE_FUNCTIONS.setThreadStatus, { threadId, status });
  }

  createMessage(input: {
    threadId: string;
    ownerUserId: string;
    role: MessageRecord["role"];
    text: string;
    runId?: string;
    status: MessageRecord["status"];
  }): Promise<MessageRecord> {
    return this.mutation(SERVICE_FUNCTIONS.createMessage, input);
  }

  async updateMessageText(messageId: string, text: string): Promise<void> {
    await this.mutation(SERVICE_FUNCTIONS.updateMessageText, { messageId, text });
  }

  async finalizeMessage(
    messageId: string,
    input: { text: string; status: "complete" | "error" },
  ): Promise<void> {
    await this.mutation(SERVICE_FUNCTIONS.finalizeMessage, { messageId, ...input });
  }

  listMessages(threadId: string, limit: number): Promise<MessageRecord[]> {
    return this.query(SERVICE_FUNCTIONS.listMessages, { threadId, limit });
  }

  createRun(input: {
    runId: string;
    threadId: string;
    ownerUserId: string;
    agentKind: RunRecord["agentKind"];
    mode: RunRecord["mode"];
    promptMessageId?: string;
  }): Promise<RunRecord> {
    return this.mutation(SERVICE_FUNCTIONS.createRun, input);
  }

  getRun(runId: string): Promise<RunRecord | null> {
    return this.query(SERVICE_FUNCTIONS.getRun, { runId });
  }

  async setRunStatus(runId: string, status: RunRecord["status"]): Promise<void> {
    await this.mutation(SERVICE_FUNCTIONS.setRunStatus, { runId, status });
  }

  async finalizeRun(runId: string, summary: RunResultSummary): Promise<void> {
    await this.mutation(SERVICE_FUNCTIONS.finalizeRun, { runId, ...summary });
  }

  async setRunVerificationReport(
    runId: string,
    verificationReportJson: string,
  ): Promise<void> {
    await this.mutation(SERVICE_FUNCTIONS.setRunVerificationReport, {
      runId,
      verificationReportJson,
    });
  }

  appendRunEvent(input: {
    runId: string;
    type: RunEventRecord["type"];
    payload: Record<string, unknown>;
  }): Promise<RunEventRecord> {
    return this.mutation(SERVICE_FUNCTIONS.appendRunEvent, {
      runId: input.runId,
      type: input.type,
      payloadJson: JSON.stringify(input.payload),
    });
  }

  listRunEvents(runId: string): Promise<RunEventRecord[]> {
    return this.query(SERVICE_FUNCTIONS.listRunEvents, { runId });
  }

  createInteraction(input: CreateInteractionInput): Promise<PendingInteraction> {
    // `payload` must NOT be sent alongside payloadJson — the Convex endpoint
    // validates args exactly and rejects unknown fields (found live, Step 1).
    const { payload, ...rest } = input;
    return this.mutation(SERVICE_FUNCTIONS.createInteraction, {
      ...rest,
      payloadJson: JSON.stringify(payload),
    });
  }

  getInteraction(interactionId: string): Promise<PendingInteraction | null> {
    return this.query(SERVICE_FUNCTIONS.getInteraction, { interactionId });
  }

  respondInteraction(
    interactionId: string,
    response: InteractionResponse,
  ): Promise<PendingInteraction | null> {
    return this.mutation(SERVICE_FUNCTIONS.respondInteraction, {
      interactionId,
      responseJson: JSON.stringify(response),
    });
  }

  async expireInteraction(interactionId: string): Promise<void> {
    await this.mutation(SERVICE_FUNCTIONS.expireInteraction, { interactionId });
  }

  // Convex reactivity is on the web side; the service polls during the
  // hold-window (bounded by timeoutMs ≈ 45s, so worst case ~30 queries).
  async waitForResponse(
    interactionId: string,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<PendingInteraction | null> {
    const deadline = this.now() + timeoutMs;
    while (this.now() < deadline && !signal?.aborted) {
      const interaction = await this.getInteraction(interactionId);
      if (!interaction) {
        return null;
      }
      if (interaction.status === "responded") {
        return interaction;
      }
      if (interaction.status !== "pending") {
        return null;
      }
      await this.sleep(Math.min(RESPONSE_POLL_MS, Math.max(0, deadline - this.now())));
    }
    return null;
  }

  listInteractions(threadId: string): Promise<PendingInteraction[]> {
    return this.query(SERVICE_FUNCTIONS.listInteractions, { threadId });
  }

  listContextArtifacts(
    threadId: string,
    artifactIds: string[],
  ): Promise<ArtifactSnapshot[]> {
    return this.query(SERVICE_FUNCTIONS.listContextArtifacts, { threadId, artifactIds });
  }

  getArtifact(artifactId: string): Promise<ArtifactSnapshot | null> {
    return this.query(SERVICE_FUNCTIONS.getArtifact, { artifactId });
  }

  getWorkspaceManifests(
    ownerUserId: string,
    workspaceIds: string[],
  ): Promise<WorkspaceManifest[]> {
    return this.query(SERVICE_FUNCTIONS.getWorkspaceManifests, {
      ownerUserId,
      workspaceIds,
    });
  }

  searchThreadDocuments(threadId: string, query: string): Promise<string> {
    // Action: delegates to @convex-dev/rag which stays Convex-owned (plan §3).
    return this.action(SERVICE_FUNCTIONS.searchThreadDocuments, { threadId, query });
  }

  applyArtifactAction(
    ownerUserId: string,
    threadId: string,
    action: ArtifactAction,
  ): Promise<{ ok: boolean; artifactId?: string; reason?: string }> {
    return this.mutation(SERVICE_FUNCTIONS.applyArtifactAction, {
      ownerUserId,
      threadId,
      ...action,
    });
  }

  applyWorkspaceAction(
    ownerUserId: string,
    action: WorkspaceAction,
  ): Promise<{ ok: boolean; workspaceId?: string; reason?: string }> {
    return this.mutation(SERVICE_FUNCTIONS.applyWorkspaceAction, {
      ownerUserId,
      ...action,
    });
  }

  upsertResearchPhase(input: {
    runId: string;
    phase: ResearchPhaseState["phase"];
    status: ResearchPhaseState["status"];
    output?: string;
    sdkSessionId?: string;
    costUsd?: number;
  }): Promise<ResearchPhaseState> {
    return this.mutation(SERVICE_FUNCTIONS.upsertResearchPhase, input);
  }

  listResearchPhases(runId: string): Promise<ResearchPhaseState[]> {
    return this.query(SERVICE_FUNCTIONS.listResearchPhases, { runId });
  }
}

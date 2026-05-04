import type { UIMessage } from "ai";
import type { ChatModel } from "./model";

export type ChatThread = ChatModel["chatThread"];
export type ChatMessage = ChatModel["chatMessage"];
export type AgentRun = ChatModel["agentRun"];
export type AgentEvent = ChatModel["agentEvent"];
export type ChatSource = ChatModel["chatSource"];
export type ChatArtifact = ChatModel["chatArtifact"];

export interface ChatScope {
  userId: string;
}

export interface CreateChatThreadInput extends ChatScope {
  model: string | null;
}

export interface CreateAgentRunInput extends ChatScope {
  chatThreadId: string;
  metadata?: unknown;
}

export interface AppendAgentEventInput {
  sequence: number;
  type: string;
  scope: AgentEvent["scope"];
  status: AgentEvent["status"];
  title: string;
  summary?: string | null;
  agentName?: string | null;
  toolName?: string | null;
  parentEventId?: string | null;
  payload?: unknown;
  occurredAt?: string;
}

export interface AppendChatSourceInput {
  kind: ChatSource["kind"];
  title?: string | null;
  url?: string | null;
  filename?: string | null;
  mediaType?: string | null;
  providerSourceId?: string | null;
  metadata?: unknown;
  seenAt?: string;
}

export interface UpsertChatSourceInput extends AppendChatSourceInput {
  chatThreadId: string;
  runId: string;
  sourceKey: string;
}

export interface AppendChatArtifactInput {
  ownerUserId: string;
  chatThreadId: string;
  runId: string;
  messageId?: string | null;
  kind: ChatArtifact["kind"];
  title: string;
  caption?: string | null;
  fileKey?: string | null;
  url?: string | null;
  contentType: ChatArtifact["contentType"];
  byteSize?: number | null;
  checksum?: string | null;
  sourceIds?: string[];
  sourceRefs?: unknown;
  visualSpec?: unknown;
  auditStatus: ChatArtifact["auditStatus"];
  auditSummary?: string | null;
  failureSummary?: string | null;
  developerDetail?: unknown;
}

export interface FinishAgentRunInput {
  status: Extract<AgentRun["status"], "completed" | "failed" | "cancel_requested" | "canceled">;
  errorMessage?: string | null;
  completedAt?: string;
}

export interface RequestRunCancellationInput {
  requestedAt?: string;
}

export interface ChatStore {
  listThreads(scope: ChatScope): Promise<ChatThread[]>;
  createThread(input: CreateChatThreadInput): Promise<ChatThread>;
  getThread(scope: ChatScope, threadId: string): Promise<ChatThread | null>;
  getMessages(scope: ChatScope, threadId: string): Promise<ChatMessage[]>;
  getRun(
    scope: ChatScope,
    threadId: string,
    runId: string,
  ): Promise<AgentRun | null>;
  getLatestRun(scope: ChatScope, threadId: string): Promise<AgentRun | null>;
  getEvents(scope: ChatScope, threadId: string): Promise<AgentEvent[]>;
  getSources(scope: ChatScope, threadId: string): Promise<ChatSource[]>;
  getArtifacts(scope: ChatScope, threadId: string): Promise<ChatArtifact[]>;
  createRun(input: CreateAgentRunInput): Promise<AgentRun>;
  requestRunCancellation(
    scope: ChatScope,
    threadId: string,
    runId: string,
    input?: RequestRunCancellationInput,
  ): Promise<AgentRun | null>;
  appendEvent(
    scope: ChatScope,
    run: Pick<AgentRun, "id" | "chatThreadId">,
    event: AppendAgentEventInput,
  ): Promise<AgentEvent>;
  upsertSource(
    scope: ChatScope,
    source: UpsertChatSourceInput,
  ): Promise<ChatSource>;
  appendArtifact(
    scope: ChatScope,
    artifact: AppendChatArtifactInput,
  ): Promise<ChatArtifact>;
  finishRun(
    scope: ChatScope,
    runId: string,
    input: FinishAgentRunInput,
  ): Promise<AgentRun | null>;
  appendMessage(
    scope: ChatScope,
    message: Omit<ChatMessage, "createdAt"> & { createdAt?: string },
  ): Promise<ChatMessage | null>;
  upsertMessages(
    scope: ChatScope,
    threadId: string,
    messages: UIMessage[],
  ): Promise<ChatMessage[] | null>;
  updateThread(
    scope: ChatScope,
    threadId: string,
    patch: Partial<Pick<ChatThread, "title" | "updatedAt">> & {
      lastMessageAt?: string | null;
    },
  ): Promise<ChatThread | null>;
  deleteThread(scope: ChatScope, threadId: string): Promise<boolean>;
}

import type { UIMessage } from "ai";

export type ChatThread = {
  id: string;
  userId: string;
  title: string;
  model: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessage = UIMessage & {
  threadId?: string;
  createdAt?: string;
};

export type AgentRun = {
  id: string;
  chatThreadId: string;
  userId: string;
  status: "queued" | "running" | "completed" | "failed" | "cancel_requested";
  errorMessage: string | null;
  metadata: unknown;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AgentEvent = {
  id: string;
  runId: string;
  chatThreadId: string;
  sequence: number;
  type: string;
  scope:
    | "run"
    | "step"
    | "reasoning"
    | "tool"
    | "source"
    | "message"
    | "error"
    | "agent"
    | "stream";
  status: "pending" | "running" | "completed" | "failed";
  title: string;
  summary: string | null;
  agentName: string | null;
  toolName: string | null;
  parentEventId: string | null;
  payload: unknown;
  occurredAt: string;
  createdAt: string;
};

export type ChatThreadDetail = {
  thread: ChatThread;
  messages: ChatMessage[];
  latestRun: AgentRun | null;
  events: AgentEvent[];
};

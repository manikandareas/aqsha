export type AgentDepthMode = "standard" | "deep";

export type AgentThread = {
  id: string;
  workspaceId: string;
  userId: string;
  title: string;
  depthMode: AgentDepthMode;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
};

export type AgentMessage = {
  id: string;
  threadId: string;
  workspaceId: string;
  userId: string;
  runId: string | null;
  role: "user" | "assistant" | "system";
  content: string;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
};

export type AgentRun = {
  id: string;
  threadId: string;
  workspaceId: string;
  userId: string;
  status: "queued" | "running" | "completed" | "failed" | "cancel_requested";
  depthMode: AgentDepthMode;
  errorMessage: string | null;
  errorMetadata: unknown;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AgentEvent = {
  id: string;
  runId: string;
  threadId: string;
  sequence: number;
  type: string;
  status: "pending" | "running" | "completed" | "failed";
  title: string;
  visibility: "public" | "internal";
  data: unknown;
  createdAt: string;
};

export type AgentThreadDetail = {
  thread: AgentThread;
  messages: AgentMessage[];
  latestRun: AgentRun | null;
  events: AgentEvent[];
};

export type AgentApiError = {
  error?: {
    code?: string;
    message?: string;
  };
};

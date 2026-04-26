import type {
  AgentEvent,
  AgentMessage,
  AgentRun,
  AgentThread,
  AgentThreadDetail,
} from "@/features/agents/lib/types";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function normalizeAgentThread(value: unknown): AgentThread {
  const thread = asRecord(value);

  return {
    id: asString(thread.id),
    workspaceId: asString(thread.workspaceId),
    userId: asString(thread.userId),
    title: asString(thread.title, "New chat"),
    depthMode: thread.depthMode === "deep" ? "deep" : "standard",
    status: thread.status === "archived" ? "archived" : "active",
    createdAt: asString(thread.createdAt, new Date().toISOString()),
    updatedAt: asString(thread.updatedAt, new Date().toISOString()),
  };
}

export function normalizeAgentMessage(value: unknown): AgentMessage {
  const message = asRecord(value);
  const role = message.role;

  return {
    id: asString(message.id),
    threadId: asString(message.threadId),
    workspaceId: asString(message.workspaceId),
    userId: asString(message.userId),
    runId: typeof message.runId === "string" ? message.runId : null,
    role: role === "assistant" || role === "system" ? role : "user",
    content: asString(message.content),
    metadata: message.metadata ?? null,
    createdAt: asString(message.createdAt, new Date().toISOString()),
    updatedAt: asString(message.updatedAt, new Date().toISOString()),
  };
}

export function normalizeAgentRun(value: unknown): AgentRun | null {
  if (!value) {
    return null;
  }

  const run = asRecord(value);
  const status = run.status;

  return {
    id: asString(run.id),
    threadId: asString(run.threadId),
    workspaceId: asString(run.workspaceId),
    userId: asString(run.userId),
    status:
      status === "queued" ||
      status === "running" ||
      status === "failed" ||
      status === "cancel_requested"
        ? status
        : "completed",
    depthMode: run.depthMode === "deep" ? "deep" : "standard",
    errorMessage: typeof run.errorMessage === "string" ? run.errorMessage : null,
    errorMetadata: run.errorMetadata ?? null,
    startedAt: typeof run.startedAt === "string" ? run.startedAt : null,
    completedAt: typeof run.completedAt === "string" ? run.completedAt : null,
    createdAt: asString(run.createdAt, new Date().toISOString()),
    updatedAt: asString(run.updatedAt, new Date().toISOString()),
  };
}

export function normalizeAgentEvent(value: unknown): AgentEvent {
  const event = asRecord(value);
  const status = event.status;

  return {
    id: asString(event.id),
    runId: asString(event.runId),
    threadId: asString(event.threadId),
    sequence: typeof event.sequence === "number" ? event.sequence : 0,
    type: asString(event.type),
    status:
      status === "pending" || status === "completed" || status === "failed"
        ? status
        : "running",
    title: asString(event.title, asString(event.type, "Agent event")),
    visibility: event.visibility === "internal" ? "internal" : "public",
    data: event.data ?? null,
    createdAt: asString(event.createdAt, new Date().toISOString()),
  };
}

export function normalizeAgentThreadDetail(value: unknown): AgentThreadDetail {
  const detail = asRecord(value);

  return {
    thread: normalizeAgentThread(detail.thread),
    messages: Array.isArray(detail.messages)
      ? detail.messages.map(normalizeAgentMessage)
      : [],
    latestRun: normalizeAgentRun(detail.latestRun),
    events: Array.isArray(detail.events)
      ? detail.events.map(normalizeAgentEvent)
      : [],
  };
}

export function extractAssistantContent(value: unknown): string | null {
  const data = asRecord(value);
  const content = data.content ?? data.response ?? data.chat_response;

  return typeof content === "string" && content.trim() ? content : null;
}

export function getAgentErrorMessage(error: unknown, fallback: string): string {
  const value = asRecord(error);
  const payload = asRecord(value.error);

  return typeof payload.message === "string" ? payload.message : fallback;
}

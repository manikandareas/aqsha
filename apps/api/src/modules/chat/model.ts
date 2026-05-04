import { t, type UnwrapSchema } from "elysia";

const chatThread = t.Object({
  id: t.String(),
  userId: t.String(),
  title: t.String(),
  model: t.Union([t.String(), t.Null()]),
  createdAt: t.String(),
  updatedAt: t.String(),
});

const chatMessage = t.Object({
  id: t.String(),
  threadId: t.String(),
  role: t.Union([t.Literal("user"), t.Literal("assistant"), t.Literal("system")]),
  parts: t.Array(t.Any()),
  createdAt: t.String(),
});

const agentRun = t.Object({
  id: t.String(),
  chatThreadId: t.String(),
  userId: t.String(),
  status: t.Union([
    t.Literal("queued"),
    t.Literal("running"),
    t.Literal("completed"),
    t.Literal("failed"),
    t.Literal("cancel_requested"),
    t.Literal("canceled"),
  ]),
  errorMessage: t.Union([t.String(), t.Null()]),
  metadata: t.Any(),
  startedAt: t.Union([t.String(), t.Null()]),
  completedAt: t.Union([t.String(), t.Null()]),
  createdAt: t.String(),
  updatedAt: t.String(),
});

const agentEvent = t.Object({
  id: t.String(),
  runId: t.String(),
  chatThreadId: t.String(),
  sequence: t.Number(),
  type: t.String(),
  scope: t.Union([
    t.Literal("run"),
    t.Literal("step"),
    t.Literal("reasoning"),
    t.Literal("tool"),
    t.Literal("source"),
    t.Literal("message"),
    t.Literal("error"),
    t.Literal("agent"),
    t.Literal("stream"),
  ]),
  status: t.Union([
    t.Literal("pending"),
    t.Literal("running"),
    t.Literal("completed"),
    t.Literal("failed"),
  ]),
  title: t.String(),
  summary: t.Union([t.String(), t.Null()]),
  agentName: t.Union([t.String(), t.Null()]),
  toolName: t.Union([t.String(), t.Null()]),
  parentEventId: t.Union([t.String(), t.Null()]),
  payload: t.Any(),
  occurredAt: t.String(),
  createdAt: t.String(),
});

const chatSource = t.Object({
  id: t.String(),
  chatThreadId: t.String(),
  runId: t.String(),
  kind: t.Union([t.Literal("url"), t.Literal("document")]),
  title: t.Union([t.String(), t.Null()]),
  url: t.Union([t.String(), t.Null()]),
  filename: t.Union([t.String(), t.Null()]),
  mediaType: t.Union([t.String(), t.Null()]),
  providerSourceId: t.Union([t.String(), t.Null()]),
  metadata: t.Any(),
  firstSeenAt: t.String(),
  lastSeenAt: t.String(),
  createdAt: t.String(),
  updatedAt: t.String(),
});

const chatThreadDetail = t.Object({
  thread: chatThread,
  messages: t.Array(chatMessage),
  latestRun: t.Union([agentRun, t.Null()]),
  events: t.Array(agentEvent),
  sources: t.Array(chatSource),
});

const unauthorizedError = t.Object({
  error: t.Object({
    code: t.Literal("unauthorized"),
    message: t.String(),
  }),
});

const chatThreadNotFoundError = t.Object({
  error: t.Object({
    code: t.Literal("chat_thread_not_found"),
    message: t.String(),
  }),
});

const agentRunActiveError = t.Object({
  error: t.Object({
    code: t.Literal("agent_run_active"),
    message: t.String(),
  }),
});

const agentRunNotFoundError = t.Object({
  error: t.Object({
    code: t.Literal("agent_run_not_found"),
    message: t.String(),
  }),
});

export const chatModel = {
  createThreadBody: t.Object({
    model: t.Optional(t.Union([t.String(), t.Null()])),
  }),
  sendMessageBody: t.Object({
    message: t.Object({
      id: t.Optional(t.String()),
      role: t.Literal("user"),
      parts: t.Array(t.Any()),
    }),
  }),
  chatThread,
  chatMessage,
  agentRun,
  agentEvent,
  chatSource,
  chatThreadDetail,
  unauthorizedError,
  chatThreadNotFoundError,
  agentRunActiveError,
  agentRunNotFoundError,
  okResponse: t.Object({
    ok: t.Boolean(),
  }),
};

export type ChatModel = {
  [K in keyof typeof chatModel]: UnwrapSchema<(typeof chatModel)[K]>;
};

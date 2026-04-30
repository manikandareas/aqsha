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

const chatThreadDetail = t.Object({
  thread: chatThread,
  messages: t.Array(chatMessage),
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
  chatThreadDetail,
  unauthorizedError,
  chatThreadNotFoundError,
  okResponse: t.Object({
    ok: t.Boolean(),
  }),
};

export type ChatModel = {
  [K in keyof typeof chatModel]: UnwrapSchema<(typeof chatModel)[K]>;
};

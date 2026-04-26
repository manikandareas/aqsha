import { table } from "@aqsha/db/schema";
import { spreads } from "@aqsha/db/utils";
import { t, type UnwrapSchema } from "elysia";

const threadBase = spreads({ agentThreads: table.agentThreads }, "select")
  .agentThreads;
const messageBase = spreads({ agentMessages: table.agentMessages }, "select")
  .agentMessages;
const runBase = spreads({ agentRuns: table.agentRuns }, "select").agentRuns;
const eventBase = spreads({ agentEvents: table.agentEvents }, "select")
  .agentEvents;

const agentThread = t.Object({
  id: threadBase.id,
  workspaceId: threadBase.workspaceId,
  userId: threadBase.userId,
  title: threadBase.title,
  depthMode: threadBase.depthMode,
  status: threadBase.status,
  createdAt: t.String(),
  updatedAt: t.String(),
});

const agentMessage = t.Object({
  id: messageBase.id,
  threadId: messageBase.threadId,
  workspaceId: messageBase.workspaceId,
  userId: messageBase.userId,
  runId: t.Union([messageBase.runId, t.Null()]),
  role: messageBase.role,
  content: messageBase.content,
  metadata: t.Union([t.Any(), t.Null()]),
  createdAt: t.String(),
  updatedAt: t.String(),
});

const agentRun = t.Object({
  id: runBase.id,
  threadId: runBase.threadId,
  workspaceId: runBase.workspaceId,
  userId: runBase.userId,
  status: runBase.status,
  depthMode: runBase.depthMode,
  errorMessage: t.Union([runBase.errorMessage, t.Null()]),
  errorMetadata: t.Union([t.Any(), t.Null()]),
  startedAt: t.Union([t.String(), t.Null()]),
  completedAt: t.Union([t.String(), t.Null()]),
  createdAt: t.String(),
  updatedAt: t.String(),
});

const agentEvent = t.Object({
  id: eventBase.id,
  runId: eventBase.runId,
  threadId: eventBase.threadId,
  sequence: eventBase.sequence,
  type: eventBase.type,
  status: eventBase.status,
  title: eventBase.title,
  visibility: eventBase.visibility,
  data: t.Union([t.Any(), t.Null()]),
  createdAt: t.String(),
});

const errorResponse = (code: string) =>
  t.Object({
    error: t.Object({
      code: t.Literal(code),
      message: t.String(),
    }),
  });

export const agentModel = {
  createThreadBody: t.Object({
    title: t.Optional(t.String({ minLength: 1, maxLength: 160 })),
    depthMode: t.Optional(threadBase.depthMode),
  }),
  createMessageBody: t.Object({
    content: t.String({ minLength: 1 }),
    depthMode: t.Optional(threadBase.depthMode),
  }),
  thread: agentThread,
  threadDetail: t.Object({
    thread: agentThread,
    messages: t.Array(agentMessage),
    latestRun: t.Union([agentRun, t.Null()]),
    events: t.Array(agentEvent),
  }),
  event: agentEvent,
  run: agentRun,
  unauthorizedError: errorResponse("unauthorized"),
  workspaceNotFoundError: errorResponse("workspace_not_found"),
  threadNotFoundError: errorResponse("agent_thread_not_found"),
  runNotFoundError: errorResponse("agent_run_not_found"),
  sessionBusyError: errorResponse("agent_session_busy"),
  agentServiceUnavailableError: errorResponse("agent_service_unavailable"),
  okResponse: t.Object({ ok: t.Boolean() }),
};

export type AgentModel = {
  [K in keyof typeof agentModel]: UnwrapSchema<(typeof agentModel)[K]>;
};

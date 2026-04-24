import { t, type UnwrapSchema } from "elysia";
import { table } from "@aqsha/db/schema";
import { spreads } from "@aqsha/db/utils";

const sessionBase = spreads(
  { agentSessions: table.agentSessions },
  "select",
).agentSessions;
const eventBase = spreads({ agentEvents: table.agentEvents }, "select")
  .agentEvents;
const messageBase = spreads({ agentMessages: table.agentMessages }, "select")
  .agentMessages;
const researchPhase = t.Union([
  t.Literal("planner"),
  t.Literal("researcher"),
  t.Literal("critic"),
  t.Literal("synthesizer"),
  t.Literal("citation_audit"),
  t.Literal("synthesizer_revision"),
  t.Literal("final"),
]);

const progressEvent = t.Object({
  type: t.Union([
    t.Literal("session"),
    t.Literal("phase"),
    t.Literal("progress"),
    t.Literal("user_message"),
    t.Literal("assistant_message"),
    t.Literal("completed"),
    t.Literal("failed"),
  ]),
  sessionId: t.String(),
  phase: t.Optional(researchPhase),
  message: t.String(),
  messageId: t.Optional(t.String()),
  turnNumber: t.Optional(t.Number()),
  at: t.String(),
});

const unauthorizedError = t.Object({
  error: t.Object({
    code: t.Literal("unauthorized"),
    message: t.String(),
  }),
});

const workspaceNotFoundError = t.Object({
  error: t.Object({
    code: t.Literal("workspace_not_found"),
    message: t.String(),
  }),
});

const sessionNotFoundError = t.Object({
  error: t.Object({
    code: t.Literal("agent_session_not_found"),
    message: t.String(),
  }),
});

const sessionBusyError = t.Object({
  error: t.Object({
    code: t.Literal("agent_session_busy"),
    message: t.String(),
  }),
});

const researchMessage = t.Object({
  id: messageBase.id,
  sessionId: messageBase.sessionId,
  workspaceId: messageBase.workspaceId,
  userId: messageBase.userId,
  role: messageBase.role,
  status: messageBase.status,
  content: messageBase.content,
  turnNumber: messageBase.turnNumber,
  depthMode: messageBase.depthMode,
  runId: t.Union([messageBase.runId, t.Null()]),
  errorMessage: t.Union([t.String(), t.Null()]),
  metadata: t.Any(),
  createdAt: t.String(),
  updatedAt: t.String(),
});

export const agentsModel = {
  createResearchBody: t.Object({
    prompt: t.String({ minLength: 1 }),
    depthMode: t.Optional(sessionBase.depthMode),
  }),
  followUpResearchBody: t.Object({
    message: t.String({ minLength: 1 }),
    depthMode: t.Optional(sessionBase.depthMode),
  }),
  sessionParams: t.Object({
    sessionId: t.String({ format: "uuid" }),
  }),
  researchSession: t.Object({
    id: sessionBase.id,
    workspaceId: sessionBase.workspaceId,
    userId: sessionBase.userId,
    prompt: sessionBase.prompt,
    depthMode: sessionBase.depthMode,
    status: sessionBase.status,
    finalAnswer: t.Union([t.String(), t.Null()]),
    auditWarnings: t.Array(t.String()),
    auditFailures: t.Array(t.String()),
    messages: t.Array(researchMessage),
    evidenceSummary: t.Object({
      evidenceItemCount: t.Number(),
      supportedClaimCount: t.Number(),
    }),
    errorMessage: t.Union([t.String(), t.Null()]),
    startedAt: t.Union([t.String(), t.Null()]),
    completedAt: t.Union([t.String(), t.Null()]),
    createdAt: t.String(),
    updatedAt: t.String(),
  }),
  persistedEvent: t.Object({
    id: eventBase.id,
    sessionId: eventBase.sessionId,
    runId: t.Union([eventBase.runId, t.Null()]),
    phase: t.Union([t.String(), t.Null()]),
    sequence: eventBase.sequence,
    eventType: eventBase.eventType,
    curated: t.Any(),
    createdAt: t.String(),
  }),
  progressEvent,
  researchMessage,
  unauthorizedError,
  workspaceNotFoundError,
  sessionNotFoundError,
  sessionBusyError,
  notFoundError: t.Union([workspaceNotFoundError, sessionNotFoundError]),
};

export type AgentsModel = {
  [K in keyof typeof agentsModel]: UnwrapSchema<(typeof agentsModel)[K]>;
};

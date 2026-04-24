import type {
  agentDepthModes,
  agentMessageRoles,
  agentMessageStatuses,
  agentResearchPhases,
  agentRunStatuses,
  agentSessionStatuses,
} from "@aqsha/db";

export type AgentDepthMode = (typeof agentDepthModes)[number];
export type AgentMessageRole = (typeof agentMessageRoles)[number];
export type AgentMessageStatus = (typeof agentMessageStatuses)[number];
export type AgentResearchPhase = (typeof agentResearchPhases)[number];
export type AgentRunStatus = (typeof agentRunStatuses)[number];
export type AgentSessionStatus = (typeof agentSessionStatuses)[number];

export type AgentIdentity = {
  clerkUserId: string;
  authTokenIdentifier: string;
};

export type AgentProgressEvent = {
  type:
    | "session"
    | "phase"
    | "progress"
    | "user_message"
    | "assistant_message"
    | "completed"
    | "failed";
  sessionId: string;
  phase?: AgentResearchPhase;
  message: string;
  messageId?: string;
  turnNumber?: number;
  at: string;
};

export type PhaseModelConfig = {
  phase: AgentResearchPhase;
  depthMode: AgentDepthMode;
  model: string;
  maxTurns: number;
  maxBudgetUsd: number;
  taskBudgetTokens: number;
};

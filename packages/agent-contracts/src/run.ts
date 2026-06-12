import { z } from "zod";

// Shared run contracts between packages/convex (trigger + storage), apps/agents
// (executor), and later apps/web (display). Mirrors plan §4.5 first-party tables.

export const agentKindSchema = z.enum(["lite", "pro"]);
export type AgentKind = z.infer<typeof agentKindSchema>;

export const runModeSchema = z.enum(["normal", "deep"]);
export type RunMode = z.infer<typeof runModeSchema>;

// Same lifecycle as the legacy runtime (agent/runLifecycle.ts) so the product
// semantics (one active run per thread, waiting_hitl, cancel) carry over.
export const runStatusSchema = z.enum([
  "queued",
  "running",
  "waiting",
  "waiting_hitl",
  "completed",
  "failed",
  "canceled",
]);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const ACTIVE_RUN_STATUSES: readonly RunStatus[] = [
  "queued",
  "running",
  "waiting",
  "waiting_hitl",
];

export function isActiveRunStatus(status: RunStatus): boolean {
  return ACTIVE_RUN_STATUSES.includes(status);
}

export const contextRefsSchema = z.object({
  artifactIds: z.array(z.string()).default([]),
  workspaceIds: z.array(z.string()).default([]),
});
export type ContextRefs = z.infer<typeof contextRefsSchema>;

// POST /runs payload: Convex creates the queued run + user message, then hands
// execution to the agent service with this envelope.
export const runRequestSchema = z.object({
  runId: z.string().min(1),
  threadId: z.string().min(1),
  ownerUserId: z.string().min(1),
  agentKind: agentKindSchema,
  mode: runModeSchema.default("normal"),
  prompt: z.string().min(1).max(32_000),
  promptMessageId: z.string().min(1).optional(),
  contextRefs: contextRefsSchema.default({ artifactIds: [], workspaceIds: [] }),
});
export type RunRequest = z.infer<typeof runRequestSchema>;

export const runEventTypeSchema = z.enum([
  "run_status",
  "tool_start",
  "tool_end",
  "subagent_start",
  "subagent_stop",
  "compaction",
  "citation_check",
  "interaction_pending",
  "interaction_resolved",
  "error",
]);
export type RunEventType = z.infer<typeof runEventTypeSchema>;

export const runEventSchema = z.object({
  runId: z.string().min(1),
  seq: z.number().int().nonnegative(),
  type: runEventTypeSchema,
  payload: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.number(),
});
export type RunEvent = z.infer<typeof runEventSchema>;

// Final accounting persisted on agentRuns from the SDK result message.
export const runUsageSchema = z.object({
  inputTokens: z.number().nonnegative().optional(),
  outputTokens: z.number().nonnegative().optional(),
  cacheReadInputTokens: z.number().nonnegative().optional(),
  cacheCreationInputTokens: z.number().nonnegative().optional(),
});
export type RunUsage = z.infer<typeof runUsageSchema>;

export const runResultSummarySchema = z.object({
  status: runStatusSchema,
  sdkSessionId: z.string().optional(),
  costUsd: z.number().nonnegative().optional(),
  usage: runUsageSchema.optional(),
  numTurns: z.number().int().nonnegative().optional(),
  errorMessage: z.string().optional(),
});
export type RunResultSummary = z.infer<typeof runResultSummarySchema>;

import type { ActionCtx } from "../../_generated/server";

/**
 * Shared base context shape attached to agent tool executions. The framework
 * injects `userId`/`threadId`/`messageId`; per-turn values that the framework
 * cannot carry (e.g. the shared citation counter, or a deep-research `runId`) are
 * threaded into tools via closure in their build* factory instead.
 */
export type AgentToolCtx = ActionCtx & {
  userId?: string;
  threadId?: string;
  messageId?: string;
};

export function requireToolUser(ctx: AgentToolCtx) {
  if (!ctx.userId) {
    throw new Error("Tool call is missing user context");
  }
  return ctx.userId;
}

export function requireToolThread(ctx: AgentToolCtx) {
  if (!ctx.threadId) {
    throw new Error("Tool call is missing thread context");
  }
  return ctx.threadId;
}

export function requireToolMessageId(ctx: AgentToolCtx, fallback: string) {
  return ctx.messageId ?? fallback;
}

/**
 * Undefined-tolerant superset used to validate model-supplied Convex ids before
 * casting. Returns false for undefined/empty inputs.
 */
export function isLikelyConvexId(value: string | undefined) {
  return Boolean(value && /^[a-z0-9]{24,40}$/.test(value));
}

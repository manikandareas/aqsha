import type { Doc } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { throwAppError } from "../../lib/appError";

// Plain helpers for the agent service facade (convex/agent/service.ts) — the
// Convex side of the apps/agents SERVICE_FUNCTIONS contract. No Convex
// registrations here (project convention).

/**
 * Every service endpoint authenticates with the shared bearer secret
 * (AGENTS_SERVICE_TOKEN in the deployment env). These are public functions —
 * this check IS the security boundary; keep it first in every handler.
 */
export function requireServiceToken(serviceToken: string): void {
  const expected = process.env.AGENTS_SERVICE_TOKEN?.trim();
  if (!expected || serviceToken !== expected) {
    throwAppError({
      message: "Invalid service token",
      code: "service_unauthorized",
    });
  }
}

const PREVIEW_LENGTH = 160;

export function messagePreview(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= PREVIEW_LENGTH) {
    return collapsed;
  }
  // Truncate WITHOUT splitting a UTF-16 surrogate pair. A `.slice` that lands
  // between a high/low surrogate (e.g. an emoji at the boundary) leaves a lone
  // surrogate — an invalid Unicode string Convex refuses to store ("Received
  // invalid json: unexpected end of hex escape"). Step back off a trailing high
  // surrogate before appending the ellipsis.
  let end = PREVIEW_LENGTH - 1;
  const lastCode = collapsed.charCodeAt(end - 1);
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
    end -= 1;
  }
  return `${collapsed.slice(0, end)}…`;
}

// ── lookups by service-generated string ids ─────────────────────────────────

export async function findThread(
  ctx: QueryCtx | MutationCtx,
  threadId: string,
): Promise<Doc<"chatThreads"> | null> {
  return await ctx.db
    .query("chatThreads")
    .withIndex("by_thread_id", (q) => q.eq("threadId", threadId))
    .unique();
}

export async function requireThread(
  ctx: QueryCtx | MutationCtx,
  threadId: string,
): Promise<Doc<"chatThreads">> {
  const thread = await findThread(ctx, threadId);
  if (!thread) {
    throwAppError({ message: "Thread not found", code: "thread_not_found" });
  }
  return thread;
}

export async function findRun(
  ctx: QueryCtx | MutationCtx,
  runId: string,
): Promise<Doc<"agentRuns"> | null> {
  return await ctx.db
    .query("agentRuns")
    .withIndex("by_run_id", (q) => q.eq("runId", runId))
    .unique();
}

export async function requireRun(
  ctx: QueryCtx | MutationCtx,
  runId: string,
): Promise<Doc<"agentRuns">> {
  const run = await findRun(ctx, runId);
  if (!run) {
    throwAppError({ message: "Run not found", code: "run_not_found" });
  }
  return run;
}

// ── contract mappers (Convex docs → the shapes ConvexStore expects) ─────────

export function threadRecord(doc: Doc<"chatThreads">) {
  return {
    threadId: doc.threadId,
    ownerUserId: doc.ownerUserId,
    title: doc.title,
    workspaceId: doc.workspaceId ? String(doc.workspaceId) : undefined,
    status: doc.status,
    sdkSessionId: doc.sdkSessionId,
    agentKind: doc.agentKind,
    lastActivityAt: doc.lastActivityAt,
    messageCount: doc.messageCount,
  };
}

export function messageRecord(doc: Doc<"chatMessages">) {
  return {
    messageId: String(doc._id),
    threadId: doc.threadId,
    ownerUserId: doc.ownerUserId,
    role: doc.role,
    text: doc.text,
    reasoning: doc.reasoning,
    runId: doc.runId,
    status: doc.status,
    createdAt: doc.createdAt,
  };
}

export function runRecord(doc: Doc<"agentRuns">) {
  return {
    runId: doc.runId,
    threadId: doc.threadId,
    ownerUserId: doc.ownerUserId,
    promptMessageId: doc.promptMessageId,
    status: doc.status,
    mode: doc.mode,
    agentKind: doc.agentKind,
    sdkSessionId: doc.sdkSessionId,
    costUsd: doc.costUsd,
    usageJson: doc.usageJson,
    numTurns: doc.numTurns,
    errorMessage: doc.errorMessage,
    verificationReportJson: doc.verificationReportJson,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function runEventRecord(doc: Doc<"agentRunEvents">) {
  return {
    runId: doc.runId,
    seq: doc.seq,
    type: doc.type,
    payloadJson: doc.payloadJson,
    createdAt: doc.createdAt,
  };
}

function parseJsonRecord(json: string | undefined): Record<string, unknown> {
  if (!json) {
    return {};
  }
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function interactionRecord(doc: Doc<"pendingInteractions">) {
  return {
    id: String(doc._id),
    ownerUserId: doc.ownerUserId,
    threadId: doc.threadId,
    runId: doc.runId,
    type: doc.type,
    toolName: doc.toolName,
    toolUseId: doc.toolUseId,
    payload: parseJsonRecord(doc.payloadJson),
    status: doc.status,
    response: doc.responseJson
      ? (JSON.parse(doc.responseJson) as Record<string, unknown>)
      : undefined,
    createdAt: doc.createdAt,
    respondedAt: doc.respondedAt,
  };
}

export function researchPhaseRecord(doc: Doc<"researchPhaseStates">) {
  return {
    runId: doc.runId,
    phase: doc.phase,
    status: doc.status,
    output: doc.output,
    sdkSessionId: doc.sdkSessionId,
    costUsd: doc.costUsd,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// ── thread denormalized aggregates ──────────────────────────────────────────

export async function bumpThreadOnMessage(
  ctx: MutationCtx,
  thread: Doc<"chatThreads">,
  input: { text: string; countDelta: number },
): Promise<void> {
  await ctx.db.patch("chatThreads", thread._id, {
    lastActivityAt: Date.now(),
    messageCount: thread.messageCount + input.countDelta,
    ...(input.text.trim() ? { lastMessagePreview: messagePreview(input.text) } : {}),
  });
}

export async function nextRunEventSeq(
  ctx: MutationCtx,
  runId: string,
): Promise<number> {
  const last = await ctx.db
    .query("agentRunEvents")
    .withIndex("by_run_seq", (q) => q.eq("runId", runId))
    .order("desc")
    .first();
  return (last?.seq ?? -1) + 1;
}

export async function touchRun(
  ctx: MutationCtx,
  run: Doc<"agentRuns">,
  patch: Partial<Doc<"agentRuns">> = {},
): Promise<void> {
  await ctx.db.patch("agentRuns", run._id, { ...patch, updatedAt: Date.now() });
}

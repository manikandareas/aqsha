import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type AgentRunStatus =
  | "queued"
  | "running"
  | "waiting"
  | "waiting_hitl"
  | "completed"
  | "failed"
  | "canceled";
type ThreadTerminalStatus = "idle" | "failed";

// AUD-07/AUD-16: a single source of truth for "this run is still in flight".
// `waiting`/`waiting_hitl` count as active so a paused (plan-approval or
// in-thread HITL) run correctly blocks a second concurrent reply. Route every
// status reader through this predicate so a new state never silently behaves as
// inactive.
export const ACTIVE_RUN_STATUSES = ["queued", "running", "waiting", "waiting_hitl"] as const;

export function isActiveRunStatus(status: AgentRunStatus): boolean {
  return (
    status === "queued" ||
    status === "running" ||
    status === "waiting" ||
    status === "waiting_hitl"
  );
}

export async function hasActiveReplyRun(
  ctx: QueryCtx | MutationCtx,
  args: {
    ownerUserId: string;
    threadId: string;
  },
) {
  // Index-driven (AUD-07): one point lookup per active status, never a bounded
  // scan that can drop older active runs.
  for (const status of ACTIVE_RUN_STATUSES) {
    const row = await ctx.db
      .query("agentRuns")
      .withIndex("by_owner_thread_status", (q) =>
        q.eq("ownerUserId", args.ownerUserId).eq("threadId", args.threadId).eq("status", status),
      )
      .first();
    if (row) return true;
  }
  return false;
}

export async function hasOtherActiveReplyRun(
  ctx: QueryCtx | MutationCtx,
  args: {
    ownerUserId: string;
    threadId: string;
    runId: Id<"agentRuns">;
  },
) {
  for (const status of ACTIVE_RUN_STATUSES) {
    const rows = await ctx.db
      .query("agentRuns")
      .withIndex("by_owner_thread_status", (q) =>
        q.eq("ownerUserId", args.ownerUserId).eq("threadId", args.threadId).eq("status", status),
      )
      .take(2);
    if (rows.some((run) => run._id !== args.runId)) return true;
  }
  return false;
}

export async function markThreadStatusAfterTerminalRun(
  ctx: MutationCtx,
  args: {
    ownerUserId: string;
    threadId: string;
    runId: Id<"agentRuns">;
    status: ThreadTerminalStatus;
    now?: number;
  },
) {
  const newerActiveRun = await hasOtherActiveReplyRun(ctx, args);
  if (newerActiveRun) {
    return;
  }

  const metadata = await ctx.db
    .query("threadMetadata")
    .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
    .unique();
  if (metadata?.status !== "streaming") {
    return;
  }

  await ctx.db.patch("threadMetadata", metadata._id, {
    status: args.status,
    lastActivityAt: args.now ?? Date.now(),
  });
}

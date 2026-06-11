import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type AgentRunStatus = "queued" | "running" | "waiting" | "completed" | "failed" | "canceled";
type ThreadTerminalStatus = "idle" | "failed";

function isActiveReplyStatus(status: AgentRunStatus) {
  return status === "queued" || status === "running";
}

export async function hasActiveReplyRun(
  ctx: QueryCtx | MutationCtx,
  args: {
    ownerUserId: string;
    threadId: string;
  },
) {
  const runs = await ctx.db
    .query("agentRuns")
    .withIndex("by_owner_thread_created", (q) =>
      q.eq("ownerUserId", args.ownerUserId).eq("threadId", args.threadId),
    )
    .order("desc")
    .take(8);

  return runs.some((run) => isActiveReplyStatus(run.status));
}

export async function hasOtherActiveReplyRun(
  ctx: QueryCtx | MutationCtx,
  args: {
    ownerUserId: string;
    threadId: string;
    runId: Id<"agentRuns">;
  },
) {
  const runs = await ctx.db
    .query("agentRuns")
    .withIndex("by_owner_thread_created", (q) =>
      q.eq("ownerUserId", args.ownerUserId).eq("threadId", args.threadId),
    )
    .order("desc")
    .take(8);

  return runs.some(
    (run) => run._id !== args.runId && isActiveReplyStatus(run.status),
  );
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

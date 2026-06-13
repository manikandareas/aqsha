import type { MutationCtx } from "../_generated/server";
import {
  deleteRows,
  maxRowsPerTable,
  type OwnerCleanupResult,
  withinOwnerCleanupLimit,
} from "./shared";

export async function cleanupOwnerAgentData(
  ctx: MutationCtx,
  ownerUserId: string,
): Promise<OwnerCleanupResult> {
  let deletedRows = 0;

  // The agent backend is the standalone apps/agents SDK service on the
  // first-party v2 tables; the legacy v1 agent tables were dropped in the
  // v1→v2 cleanup, so account deletion only needs to clear the v2 data.
  deletedRows += await deleteV2AgentData(ctx, ownerUserId);

  return { deletedRows };
}

const maxV2Threads = 500;

// Cascade-delete the SDK first-party agent tables for an owner. chatThreads is
// the only owner-indexed table; messages/runs/events/interactions/phases hang
// off thread/run ids, so we walk the owner's threads and delete their children
// (same shape as agent.v2.removeThread, but owner-scoped and unauthenticated).
export async function deleteV2AgentData(
  ctx: MutationCtx,
  ownerUserId: string,
): Promise<number> {
  const threads = withinOwnerCleanupLimit(
    "chatThreads",
    await ctx.db
      .query("chatThreads")
      .withIndex("by_owner_activity", (q) => q.eq("ownerUserId", ownerUserId))
      .take(maxV2Threads + 1),
  );

  let deleted = 0;
  for (const thread of threads) {
    const messages = withinOwnerCleanupLimit(
      "chatMessages",
      await ctx.db
        .query("chatMessages")
        .withIndex("by_thread_created", (q) => q.eq("threadId", thread.threadId))
        .take(maxRowsPerTable + 1),
    );
    deleted += await deleteRows(ctx, "chatMessages", messages);

    const interactions = withinOwnerCleanupLimit(
      "pendingInteractions",
      await ctx.db
        .query("pendingInteractions")
        .withIndex("by_thread_created", (q) => q.eq("threadId", thread.threadId))
        .take(maxRowsPerTable + 1),
    );
    deleted += await deleteRows(ctx, "pendingInteractions", interactions);

    const runs = withinOwnerCleanupLimit(
      "agentRuns2",
      await ctx.db
        .query("agentRuns2")
        .withIndex("by_thread_created", (q) => q.eq("threadId", thread.threadId))
        .take(maxRowsPerTable + 1),
    );
    for (const run of runs) {
      const events = withinOwnerCleanupLimit(
        "agentRunEvents2",
        await ctx.db
          .query("agentRunEvents2")
          .withIndex("by_run_seq", (q) => q.eq("runId", run.runId))
          .take(maxRowsPerTable + 1),
      );
      deleted += await deleteRows(ctx, "agentRunEvents2", events);

      const phases = await ctx.db
        .query("researchPhaseStates")
        .withIndex("by_run_phase", (q) => q.eq("runId", run.runId))
        .take(20);
      deleted += await deleteRows(ctx, "researchPhaseStates", phases);
    }
    deleted += await deleteRows(ctx, "agentRuns2", runs);

    await ctx.db.delete("chatThreads", thread._id);
    deleted += 1;
  }
  return deleted;
}


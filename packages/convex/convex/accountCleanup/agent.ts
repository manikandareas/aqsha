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

  const messageWorkspaceActions = withinOwnerCleanupLimit(
    "messageWorkspaceActions",
    await ctx.db
      .query("messageWorkspaceActions")
      .withIndex("by_owner_thread_created", (q) => q.eq("ownerUserId", ownerUserId))
      .take(501),
  );
  const researchExtracts = withinOwnerCleanupLimit(
    "researchExtracts",
    await ctx.db
      .query("researchExtracts")
      .withIndex("by_owner_run", (q) => q.eq("ownerUserId", ownerUserId))
      .take(501),
  );
  const researchSources = withinOwnerCleanupLimit(
    "researchSources",
    await ctx.db
      .query("researchSources")
      .withIndex("by_owner_thread", (q) => q.eq("ownerUserId", ownerUserId))
      .take(501),
  );
  const citationChecks = withinOwnerCleanupLimit(
    "citationChecks",
    await ctx.db
      .query("citationChecks")
      .withIndex("by_owner_artifact", (q) => q.eq("ownerUserId", ownerUserId))
      .take(501),
  );
  const agentRunEvents = withinOwnerCleanupLimit(
    "agentRunEvents",
    await ctx.db
      .query("agentRunEvents")
      .withIndex("by_owner_run_created", (q) => q.eq("ownerUserId", ownerUserId))
      .take(501),
  );
  const agentRunSteps = withinOwnerCleanupLimit(
    "agentRunSteps",
    await ctx.db
      .query("agentRunSteps")
      .withIndex("by_owner_run", (q) => q.eq("ownerUserId", ownerUserId))
      .take(501),
  );
  const researchRoundStates = withinOwnerCleanupLimit(
    "researchRoundStates",
    await ctx.db
      .query("researchRoundStates")
      .withIndex("by_owner_run_round", (q) => q.eq("ownerUserId", ownerUserId))
      .take(501),
  );
  const agentRuns = withinOwnerCleanupLimit(
    "agentRuns",
    await ctx.db
      .query("agentRuns")
      .withIndex("by_owner_thread_created", (q) => q.eq("ownerUserId", ownerUserId))
      .take(501),
  );
  const threadContextArtifacts = withinOwnerCleanupLimit(
    "threadContextArtifacts",
    await ctx.db
      .query("threadContextArtifacts")
      .withIndex("by_owner_thread_created", (q) => q.eq("ownerUserId", ownerUserId))
      .take(501),
  );
  const threadMetadata = withinOwnerCleanupLimit(
    "threadMetadata",
    await ctx.db
      .query("threadMetadata")
      .withIndex("by_owner_activity", (q) => q.eq("ownerUserId", ownerUserId))
      .take(501),
  );

  deletedRows += await deleteRows(ctx, "messageWorkspaceActions", messageWorkspaceActions);
  deletedRows += await deleteRows(ctx, "researchExtracts", researchExtracts);
  deletedRows += await deleteRows(ctx, "researchSources", researchSources);
  deletedRows += await deleteRows(ctx, "citationChecks", citationChecks);
  deletedRows += await deleteRows(ctx, "agentRunEvents", agentRunEvents);
  deletedRows += await deleteRows(ctx, "agentRunSteps", agentRunSteps);
  deletedRows += await deleteRows(ctx, "researchRoundStates", researchRoundStates);
  deletedRows += await deleteRows(ctx, "agentRuns", agentRuns);
  deletedRows += await deleteRows(ctx, "threadContextArtifacts", threadContextArtifacts);
  deletedRows += await deleteRows(ctx, "threadMetadata", threadMetadata);

  // First-party SDK-backend tables (plan §4.5). These coexist with the legacy
  // component during dual-run, so account deletion must clear BOTH or the new
  // backend leaks orphaned chat data after a user is gone.
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


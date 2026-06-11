import { ConvexError } from "convex/values";
import { components } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";
import {
  deleteRows,
  type OwnerCleanupResult,
  withinOwnerCleanupLimit,
} from "./shared";

const maxAgentThreads = 100;

export async function cleanupOwnerAgentData(
  ctx: MutationCtx,
  ownerUserId: string,
): Promise<OwnerCleanupResult> {
  let deletedRows = 0;
  const deletedAgentThreads = await deleteAgentThreads(ctx, ownerUserId);

  const messageWorkspaceArtifacts = withinOwnerCleanupLimit(
    "messageWorkspaceArtifacts",
    await ctx.db
      .query("messageWorkspaceArtifacts")
      .withIndex("by_owner_thread_created", (q) => q.eq("ownerUserId", ownerUserId))
      .take(501),
  );
  const messageWorkspaceActions = withinOwnerCleanupLimit(
    "messageWorkspaceActions",
    await ctx.db
      .query("messageWorkspaceActions")
      .withIndex("by_owner_thread_created", (q) => q.eq("ownerUserId", ownerUserId))
      .take(501),
  );
  const messageCommands = withinOwnerCleanupLimit(
    "messageCommands",
    await ctx.db
      .query("messageCommands")
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

  deletedRows += await deleteRows(ctx, "messageWorkspaceArtifacts", messageWorkspaceArtifacts);
  deletedRows += await deleteRows(ctx, "messageWorkspaceActions", messageWorkspaceActions);
  deletedRows += await deleteRows(ctx, "messageCommands", messageCommands);
  deletedRows += await deleteRows(ctx, "researchExtracts", researchExtracts);
  deletedRows += await deleteRows(ctx, "researchSources", researchSources);
  deletedRows += await deleteRows(ctx, "citationChecks", citationChecks);
  deletedRows += await deleteRows(ctx, "agentRunEvents", agentRunEvents);
  deletedRows += await deleteRows(ctx, "agentRunSteps", agentRunSteps);
  deletedRows += await deleteRows(ctx, "researchRoundStates", researchRoundStates);
  deletedRows += await deleteRows(ctx, "agentRuns", agentRuns);
  deletedRows += await deleteRows(ctx, "threadContextArtifacts", threadContextArtifacts);
  deletedRows += await deleteRows(ctx, "threadMetadata", threadMetadata);

  return { deletedRows, deletedAgentThreads };
}

async function deleteAgentThreads(ctx: MutationCtx, ownerUserId: string) {
  let cursor: string | null = null;
  let deletedThreads = 0;
  let pageGuard = 0;

  while (pageGuard < 2) {
    const threads: {
      page: Array<{ _id: string }>;
      continueCursor: string;
      isDone: boolean;
    } = await ctx.runQuery(components.agent.threads.listThreadsByUserId, {
      userId: ownerUserId,
      order: "desc",
      paginationOpts: { numItems: 50, cursor },
    });

    for (const thread of threads.page) {
      let isDone = false;
      let guard = 0;
      while (!isDone && guard < 50) {
        const result: { isDone: boolean } = await ctx.runMutation(
          components.agent.threads.deleteAllForThreadIdAsync,
          { threadId: thread._id },
        );
        isDone = result.isDone;
        guard += 1;
      }
      if (!isDone) {
        throw new ConvexError("Thread deletion is still in progress. Try again.");
      }
      deletedThreads += 1;
      if (deletedThreads > maxAgentThreads) {
        throw new ConvexError(
          `Account deletion needs support cleanup: more than ${maxAgentThreads} threads.`,
        );
      }
    }

    if (threads.isDone) {
      return deletedThreads;
    }
    cursor = threads.continueCursor;
    pageGuard += 1;
  }

  throw new ConvexError(
    `Account deletion needs support cleanup: more than ${maxAgentThreads} threads.`,
  );
}

import { createThread } from "@convex-dev/agent";
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { components } from "./_generated/api";
import { mutation, query, type ActionCtx, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireCurrentUser } from "./auth";

type ThreadCtx = QueryCtx | MutationCtx | ActionCtx;

const threadSummaryValidator = v.object({
  threadId: v.string(),
  title: v.string(),
  createdAt: v.number(),
});

const threadPageValidator = v.object({
  page: v.array(threadSummaryValidator),
  continueCursor: v.string(),
  isDone: v.boolean(),
  splitCursor: v.optional(v.union(v.string(), v.null())),
  pageStatus: v.optional(
    v.union(
      v.literal("SplitRecommended"),
      v.literal("SplitRequired"),
      v.null(),
    ),
  ),
});

function summarizeThread(thread: {
  _id: string;
  _creationTime: number;
  title?: string;
}) {
  return {
    threadId: thread._id,
    title: thread.title ?? "Thread baru",
    createdAt: thread._creationTime,
  };
}

export async function assertThreadOwner(ctx: ThreadCtx, threadId: string) {
  const user = await requireCurrentUser(ctx);
  const thread = await ctx.runQuery(components.agent.threads.getThread, {
    threadId,
  });

  if (!thread || thread.userId !== user._id) {
    throw new ConvexError("Thread not found");
  }

  return thread;
}

export const create = mutation({
  args: {
    title: v.optional(v.string()),
  },
  returns: v.object({
    threadId: v.string(),
  }),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const title = args.title?.trim() || "Thread baru";
    const threadId = await createThread(ctx, components.agent, {
      userId: user._id,
      title,
    });

    return { threadId };
  },
});

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  returns: threadPageValidator,
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const threads = await ctx.runQuery(
      components.agent.threads.listThreadsByUserId,
      {
        userId: user._id,
        order: "desc",
        paginationOpts: args.paginationOpts,
      },
    );

    return {
      ...threads,
      page: threads.page.map(summarizeThread),
    };
  },
});

export const get = query({
  args: {
    threadId: v.string(),
  },
  returns: v.union(threadSummaryValidator, v.null()),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const thread = await ctx.runQuery(components.agent.threads.getThread, {
      threadId: args.threadId,
    });

    if (!thread || thread.userId !== user._id) {
      return null;
    }

    return summarizeThread(thread);
  },
});

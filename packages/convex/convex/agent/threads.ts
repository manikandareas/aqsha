import { createThread } from "@convex-dev/agent";
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { components } from "../_generated/api";
import { mutation, query, type ActionCtx, type MutationCtx, type QueryCtx } from "../_generated/server";
import { requireCurrentUser } from "../auth";
import { assertWorkspaceOwner } from "../workspaceAccess";

type ThreadCtx = QueryCtx | MutationCtx | ActionCtx;

const threadSummaryValidator = v.object({
  threadId: v.string(),
  title: v.string(),
  createdAt: v.number(),
  lastActivityAt: v.number(),
  lastMessagePreview: v.string(),
  messageCount: v.number(),
  status: v.union(v.literal("idle"), v.literal("streaming"), v.literal("failed")),
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

async function getThreadMetadata(ctx: QueryCtx, threadId: string) {
  return await ctx.db
    .query("threadMetadata")
    .withIndex("by_thread", (q) => q.eq("threadId", threadId))
    .unique();
}

async function summarizeThread(ctx: QueryCtx, thread: {
  _id: string;
  _creationTime: number;
  title?: string;
}) {
  const metadata = await getThreadMetadata(ctx, thread._id);
  return {
    threadId: thread._id,
    title: thread.title ?? "Thread baru",
    createdAt: thread._creationTime,
    lastActivityAt: metadata?.lastActivityAt ?? thread._creationTime,
    lastMessagePreview: metadata?.lastMessagePreview ?? "",
    messageCount: metadata?.messageCount ?? 0,
    status: metadata?.status ?? "idle",
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
    workspaceId: v.optional(v.id("workspaces")),
  },
  returns: v.object({
    threadId: v.string(),
  }),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    if (args.workspaceId) {
      await assertWorkspaceOwner(ctx, args.workspaceId, user._id, { requireActive: true });
    }
    const title = args.title?.trim() || "Thread baru";
    const threadId = await createThread(ctx, components.agent, {
      userId: user._id,
      title,
    });
    if (args.workspaceId) {
      const now = Date.now();
      await ctx.db.insert("threadMetadata", {
        ownerUserId: user._id,
        workspaceId: args.workspaceId,
        threadId,
        lastActivityAt: now,
        lastMessagePreview: "",
        messageCount: 0,
        status: "idle",
      });
    }

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

    const page = await Promise.all(
      threads.page.map((thread) => summarizeThread(ctx, thread)),
    );

    return {
      ...threads,
      page: page.sort((a, b) => b.lastActivityAt - a.lastActivityAt),
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

    return await summarizeThread(ctx, thread);
  },
});

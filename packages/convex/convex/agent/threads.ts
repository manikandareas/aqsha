import { createThread } from "@convex-dev/agent";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { components } from "../_generated/api";
import { mutation, query, type ActionCtx, type MutationCtx, type QueryCtx } from "../_generated/server";
import { requireCurrentUser } from "../auth";
import { assertWorkspaceOwner } from "../workspaceAccess";
import { throwAppError } from "../lib/appError";

type ThreadCtx = QueryCtx | MutationCtx | ActionCtx;

const threadSummaryValidator = v.object({
  threadId: v.string(),
  workspaceId: v.optional(v.id("workspaces")),
  title: v.string(),
  createdAt: v.number(),
  lastActivityAt: v.number(),
  lastMessagePreview: v.string(),
  messageCount: v.number(),
  status: v.union(v.literal("idle"), v.literal("streaming"), v.literal("failed")),
  lastAgentKind: v.optional(v.union(v.literal("lite"), v.literal("pro"))),
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
    workspaceId: metadata?.workspaceId,
    title: thread.title ?? "Thread baru",
    createdAt: thread._creationTime,
    lastActivityAt: metadata?.lastActivityAt ?? thread._creationTime,
    lastMessagePreview: metadata?.lastMessagePreview ?? "",
    messageCount: metadata?.messageCount ?? 0,
    status: metadata?.status ?? "idle",
    lastAgentKind: metadata?.lastAgentKind,
  };
}

export async function tryAssertThreadOwner(ctx: ThreadCtx, threadId: string) {
  const user = await requireCurrentUser(ctx);
  const thread = await ctx.runQuery(components.agent.threads.getThread, {
    threadId,
  });

  if (!thread || thread.userId !== user._id) {
    return null;
  }

  return thread;
}

export async function assertThreadOwner(ctx: ThreadCtx, threadId: string) {
  const thread = await tryAssertThreadOwner(ctx, threadId);
  if (!thread) {
    throwAppError({ message: "Thread not found", code: "thread_not_found" });
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

export const listByWorkspace = query({
  args: {
    workspaceId: v.id("workspaces"),
    paginationOpts: paginationOptsValidator,
  },
  returns: threadPageValidator,
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    await assertWorkspaceOwner(ctx, args.workspaceId, user._id);
    const metadataPage = await ctx.db
      .query("threadMetadata")
      .withIndex("by_owner_workspace_activity", (q) =>
        q.eq("ownerUserId", user._id).eq("workspaceId", args.workspaceId),
      )
      .order("desc")
      .paginate(args.paginationOpts);

    const page = (
      await Promise.all(
        metadataPage.page.map(async (metadata) => {
          const thread = await ctx.runQuery(components.agent.threads.getThread, {
            threadId: metadata.threadId,
          });
          if (!thread || thread.userId !== user._id) {
            return null;
          }
          return await summarizeThread(ctx, thread);
        }),
      )
    ).filter((thread) => thread !== null);

    return {
      ...metadataPage,
      page,
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

async function deleteThreadAppData(
  ctx: MutationCtx,
  ownerUserId: string,
  threadId: string,
) {
  const metadata = await getThreadMetadata(ctx, threadId);
  if (metadata && metadata.ownerUserId === ownerUserId) {
    await ctx.db.delete("threadMetadata", metadata._id);
  }

  const contextRows = await ctx.db
    .query("threadContextArtifacts")
    .withIndex("by_owner_thread_created", (q) =>
      q.eq("ownerUserId", ownerUserId).eq("threadId", threadId),
    )
    .collect();
  for (const row of contextRows) {
    await ctx.db.delete("threadContextArtifacts", row._id);
  }

  const messageCommands = await ctx.db
    .query("messageCommands")
    .withIndex("by_owner_thread_created", (q) =>
      q.eq("ownerUserId", ownerUserId).eq("threadId", threadId),
    )
    .collect();
  for (const row of messageCommands) {
    await ctx.db.delete("messageCommands", row._id);
  }
}

export const remove = mutation({
  args: {
    threadId: v.string(),
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    await assertThreadOwner(ctx, args.threadId);
    await deleteThreadAppData(ctx, user._id, args.threadId);

    let isDone = false;
    let guard = 0;
    while (!isDone && guard < 50) {
      const result: { isDone: boolean } = await ctx.runMutation(
        components.agent.threads.deleteAllForThreadIdAsync,
        { threadId: args.threadId },
      );
      isDone = result.isDone;
      guard += 1;
    }

    if (!isDone) {
      throwAppError({
        message: "Thread deletion is still in progress. Try again.",
        code: "thread_delete_in_progress",
        severity: "warning",
      });
    }

    return { ok: true as const };
  },
});

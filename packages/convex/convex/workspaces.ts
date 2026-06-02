import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireCurrentUser } from "./auth";
import { assertWorkspaceOwner, normalizeName } from "./workspaceAccess";
import { PLAN_CATALOG } from "./billing/catalog";
import { getBillingSnapshot } from "./billing/entitlements";
import {
  isValidStoredWorkspaceEmoji,
  normalizeWorkspaceEmoji,
  workspaceEmojiForNewWorkspace,
} from "./workspaceEmoji";

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    if (args.includeArchived) {
      return await ctx.db
        .query("workspaces")
        .withIndex("by_owner_updated", (q) => q.eq("ownerUserId", user._id))
        .order("desc")
        .paginate(args.paginationOpts);
    }
    return await ctx.db
      .query("workspaces")
      .withIndex("by_owner_status_updated", (q) =>
        q.eq("ownerUserId", user._id).eq("status", "active"),
      )
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const get = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const workspace = await ctx.db.get("workspaces", args.workspaceId);
    if (!workspace || workspace.ownerUserId !== user._id) {
      return null;
    }
    return workspace;
  },
});

export const listActionsForMessage = query({
  args: { messageId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const rows = await ctx.db
      .query("messageWorkspaceActions")
      .withIndex("by_owner_message", (q) =>
        q.eq("ownerUserId", user._id).eq("messageId", args.messageId),
      )
      .collect();
    const results = [];
    for (const row of rows) {
      const workspace = await ctx.db.get("workspaces", row.workspaceId);
      if (!workspace) {
        continue;
      }
      results.push({
        workspaceId: row.workspaceId,
        action: row.action,
        workspaceName: workspace.name,
      });
    }
    return results;
  },
});

export const create = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    return await createWorkspaceForOwner(ctx, {
      ownerUserId: user._id,
      ownerEmail: user.email,
      name: args.name,
    });
  },
});

export const createFromAgentInternal = internalMutation({
  args: {
    ownerUserId: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    return await createWorkspaceForOwner(ctx, {
      ownerUserId: args.ownerUserId,
      name: args.name,
    });
  },
});

export const rename = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    await renameWorkspaceForOwner(ctx, {
      ownerUserId: user._id,
      workspaceId: args.workspaceId,
      name: args.name,
    });
    return { ok: true };
  },
});

export const updateEmoji = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    emoji: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    await assertWorkspaceOwner(ctx, args.workspaceId, user._id);
    await ctx.db.patch("workspaces", args.workspaceId, {
      emoji: normalizeWorkspaceEmoji(args.emoji),
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const renameFromAgentInternal = internalMutation({
  args: {
    ownerUserId: v.string(),
    workspaceId: v.id("workspaces"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    await renameWorkspaceForOwner(ctx, args);
    return { ok: true as const };
  },
});

export const archive = mutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const workspace = await assertWorkspaceOwner(ctx, args.workspaceId, user._id);
    if (workspace.status === "archived") {
      return { ok: true };
    }
    const now = Date.now();
    await ctx.db.patch("workspaces", args.workspaceId, {
      status: "archived",
      archivedAt: now,
      updatedAt: now,
    });
    return { ok: true };
  },
});

export const backfillMissingWorkspaceEmojis = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.object({
    patched: v.number(),
    hasMore: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("workspaces").paginate({
      cursor: args.cursor ?? null,
      numItems: 100,
    });
    let patched = 0;
    for (const workspace of page.page) {
      if (isValidStoredWorkspaceEmoji(workspace.emoji)) {
        continue;
      }
      await ctx.db.patch("workspaces", workspace._id, {
        emoji: workspaceEmojiForNewWorkspace({
          ownerUserId: workspace.ownerUserId,
          name: workspace.name,
          now: workspace.createdAt,
        }),
      });
      patched += 1;
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.workspaces.backfillMissingWorkspaceEmojis, {
        cursor: page.continueCursor,
      });
    }
    return {
      patched,
      hasMore: !page.isDone,
      continueCursor: page.isDone ? null : page.continueCursor,
    };
  },
});

async function createWorkspaceForOwner(
  ctx: MutationCtx,
  args: {
    ownerUserId: string;
    ownerEmail?: string | null;
    name: string;
  },
) {
  await assertWorkspaceCapacity(ctx, args.ownerUserId, args.ownerEmail);
  const now = Date.now();
  return await ctx.db.insert("workspaces", {
    ownerUserId: args.ownerUserId,
    name: normalizeName(args.name, "Workspace name"),
    emoji: workspaceEmojiForNewWorkspace({
      ownerUserId: args.ownerUserId,
      name: args.name,
      now,
    }),
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
}

async function renameWorkspaceForOwner(
  ctx: MutationCtx,
  args: {
    ownerUserId: string;
    workspaceId: Id<"workspaces">;
    name: string;
  },
) {
  await assertWorkspaceOwner(ctx, args.workspaceId, args.ownerUserId);
  await ctx.db.patch("workspaces", args.workspaceId, {
    name: normalizeName(args.name, "Workspace name"),
    updatedAt: Date.now(),
  });
}

export async function listActiveWorkspacesForOwner(
  ctx: QueryCtx | MutationCtx,
  ownerUserId: string,
  limit = 50,
) {
  return await ctx.db
    .query("workspaces")
    .withIndex("by_owner_status_updated", (q) =>
      q.eq("ownerUserId", ownerUserId).eq("status", "active"),
    )
    .order("desc")
    .take(limit);
}

async function assertWorkspaceCapacity(
  ctx: MutationCtx,
  ownerUserId: string,
  ownerEmail?: string | null,
) {
  const snapshot = await getBillingSnapshot(ctx, ownerUserId, ownerEmail);
  const limit = PLAN_CATALOG[snapshot.planKey].workspaceLimit;
  if (limit === Number.MAX_SAFE_INTEGER) {
    return;
  }
  const activeWorkspaces = await ctx.db
    .query("workspaces")
    .withIndex("by_owner_status_updated", (q) =>
      q.eq("ownerUserId", ownerUserId).eq("status", "active"),
    )
    .collect();
  if (activeWorkspaces.length >= limit) {
    throw new ConvexError("Workspace limit reached for current plan");
  }
}

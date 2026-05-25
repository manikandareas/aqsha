import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { requireCurrentUser } from "./auth";
import { assertWorkspaceOwner, normalizeName } from "./workspaceAccess";
import { PLAN_CATALOG } from "./billing/catalog";
import { getBillingSnapshot } from "./billing/entitlements";

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

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    await assertWorkspaceCapacity(ctx, user._id);
    const now = Date.now();
    return await ctx.db.insert("workspaces", {
      ownerUserId: user._id,
      name: normalizeName(args.name, "Workspace name"),
      description: normalizeDescription(args.description),
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const rename = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    await assertWorkspaceOwner(ctx, args.workspaceId, user._id);
    await ctx.db.patch("workspaces", args.workspaceId, {
      name: normalizeName(args.name, "Workspace name"),
      description: normalizeDescription(args.description),
      updatedAt: Date.now(),
    });
    return { ok: true };
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

function normalizeDescription(value: string | undefined) {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.length > 500) {
    throw new ConvexError("Workspace description is too long");
  }
  return trimmed;
}

async function assertWorkspaceCapacity(
  ctx: MutationCtx,
  ownerUserId: string,
) {
  const user = await requireCurrentUser(ctx);
  const snapshot = await getBillingSnapshot(ctx, ownerUserId, user.email);
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

import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireCurrentUser } from "../auth";
import {
  assertFolderOwner,
  assertWorkspaceOwner,
  normalizeName,
} from "./access";
import { syncArtifactWorkspaceMove } from "./moveModel";

export const list = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    await assertWorkspaceOwner(ctx, args.workspaceId, user._id);
    return await ctx.db
      .query("workspaceFolders")
      .withIndex("by_owner_workspace_status_updated", (q) =>
        q
          .eq("ownerUserId", user._id)
          .eq("workspaceId", args.workspaceId)
          .eq("status", "active"),
      )
      .order("desc")
      .take(200);
  },
});

export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.string(),
  },
  returns: v.id("workspaceFolders"),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    await assertWorkspaceOwner(ctx, args.workspaceId, user._id, { requireActive: true });
    const name = normalizeName(args.name, "Folder name");
    const duplicate = await ctx.db
      .query("workspaceFolders")
      .withIndex("by_owner_workspace_name", (q) =>
        q.eq("ownerUserId", user._id).eq("workspaceId", args.workspaceId).eq("name", name),
      )
      .first();
    if (duplicate?.status === "active") {
      throw new ConvexError("Folder name already exists");
    }
    const now = Date.now();
    return await ctx.db.insert("workspaceFolders", {
      ownerUserId: user._id,
      workspaceId: args.workspaceId,
      name,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const rename = mutation({
  args: {
    folderId: v.id("workspaceFolders"),
    name: v.string(),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const folder = await assertFolderOwner(ctx, args.folderId, user._id);
    await assertWorkspaceOwner(ctx, folder.workspaceId, user._id, { requireActive: true });
    await ctx.db.patch("workspaceFolders", args.folderId, {
      name: normalizeName(args.name, "Folder name"),
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const move = mutation({
  args: {
    folderId: v.id("workspaceFolders"),
    targetWorkspaceId: v.id("workspaces"),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const folder = await assertFolderOwner(ctx, args.folderId, user._id);
    await assertWorkspaceOwner(ctx, folder.workspaceId, user._id, { requireActive: true });
    await assertWorkspaceOwner(ctx, args.targetWorkspaceId, user._id, { requireActive: true });
    if (folder.workspaceId === args.targetWorkspaceId) {
      return { ok: true };
    }

    const duplicate = await ctx.db
      .query("workspaceFolders")
      .withIndex("by_owner_workspace_name", (q) =>
        q
          .eq("ownerUserId", user._id)
          .eq("workspaceId", args.targetWorkspaceId)
          .eq("name", folder.name),
      )
      .first();
    if (duplicate?.status === "active") {
      throw new ConvexError("Folder name already exists in target workspace");
    }

    const now = Date.now();
    const artifacts = await ctx.db
      .query("artifacts")
      .withIndex("by_owner_workspace_folder_status_updated", (q) =>
        q
          .eq("ownerUserId", user._id)
          .eq("workspaceId", folder.workspaceId)
          .eq("folderId", args.folderId)
          .eq("status", "active"),
      )
      .collect();

    await ctx.db.patch("workspaceFolders", args.folderId, {
      workspaceId: args.targetWorkspaceId,
      updatedAt: now,
    });

    for (const artifact of artifacts) {
      await ctx.db.patch("artifacts", artifact._id, {
        workspaceId: args.targetWorkspaceId,
        updatedAt: now,
      });
      await syncArtifactWorkspaceMove(ctx, {
        ownerUserId: user._id,
        artifactId: artifact._id,
        targetWorkspaceId: args.targetWorkspaceId,
        updatedAt: now,
      });
    }

    return { ok: true };
  },
});

export const remove = mutation({
  args: { folderId: v.id("workspaceFolders") },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const folder = await assertFolderOwner(ctx, args.folderId, user._id);
    await assertWorkspaceOwner(ctx, folder.workspaceId, user._id, { requireActive: true });
    const now = Date.now();
    const artifacts = await ctx.db
      .query("artifacts")
      .withIndex("by_owner_workspace_folder_status_updated", (q) =>
        q
          .eq("ownerUserId", user._id)
          .eq("workspaceId", folder.workspaceId)
          .eq("folderId", args.folderId)
          .eq("status", "active"),
      )
      .collect();
    for (const artifact of artifacts) {
      await ctx.db.patch("artifacts", artifact._id, { folderId: undefined, updatedAt: now });
    }
    await ctx.db.patch("workspaceFolders", args.folderId, {
      status: "deleted",
      deletedAt: now,
      updatedAt: now,
    });
    return { ok: true };
  },
});

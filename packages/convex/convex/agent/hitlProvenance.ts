import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import {
  assertManageableWorkspaceArtifact,
  resolveWorkspaceTarget,
} from "../hitlWorkspace";

// Provenance + guard helpers exposed as internal functions so native HITL tools
// (which run in an ActionCtx and cannot touch ctx.db) can reach the workspace
// guards and write the messageWorkspaceArtifacts / messageWorkspaceActions rows.
// These mirror the side effects the legacy hitlSessions completion path wrote.

export const recordArtifactRelation = internalMutation({
  args: {
    ownerUserId: v.string(),
    threadId: v.string(),
    messageId: v.string(),
    artifactId: v.id("artifacts"),
    relation: v.union(
      v.literal("created"),
      v.literal("updated"),
      v.literal("deleted"),
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("messageWorkspaceArtifacts", {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      messageId: args.messageId,
      artifactId: args.artifactId,
      relation: args.relation,
      createdAt: Date.now(),
    });
  },
});

export const recordWorkspaceAction = internalMutation({
  args: {
    ownerUserId: v.string(),
    threadId: v.string(),
    messageId: v.string(),
    workspaceId: v.id("workspaces"),
    action: v.union(v.literal("created"), v.literal("renamed")),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("messageWorkspaceActions", {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      messageId: args.messageId,
      workspaceId: args.workspaceId,
      action: args.action,
      createdAt: Date.now(),
    });
  },
});

export const resolveWorkspaceForCreate = internalQuery({
  args: {
    ownerUserId: v.string(),
    threadId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
  },
  handler: async (ctx, args) => {
    const { workspaceId, requiresWorkspacePick } = await resolveWorkspaceTarget(ctx, {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      workspaceId: args.workspaceId,
    });
    return { workspaceId: workspaceId ?? null, requiresWorkspacePick };
  },
});

export const assertManageable = internalQuery({
  args: {
    ownerUserId: v.string(),
    artifactId: v.id("artifacts"),
  },
  handler: async (ctx, args) => {
    await assertManageableWorkspaceArtifact(ctx, args.ownerUserId, args.artifactId);
    return { ok: true as const };
  },
});

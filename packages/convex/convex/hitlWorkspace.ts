import { ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  artifactTypeForLegacyArtifact,
  isAgentWritableArtifactType,
} from "./artifactModel";
import {
  assertWorkspaceArtifactOwner,
  assertWorkspaceOwner,
} from "./workspaceAccess";

export async function getThreadMetadata(ctx: QueryCtx | MutationCtx, threadId: string) {
  return await ctx.db
    .query("threadMetadata")
    .withIndex("by_thread", (q) => q.eq("threadId", threadId))
    .unique();
}

export async function resolveWorkspaceTarget(
  ctx: QueryCtx | MutationCtx,
  args: {
    ownerUserId: string;
    threadId: string;
    workspaceId?: Id<"workspaces">;
  },
) {
  const metadata = await getThreadMetadata(ctx, args.threadId);
  const boundWorkspaceId =
    metadata?.ownerUserId === args.ownerUserId ? metadata.workspaceId : undefined;
  if (boundWorkspaceId) {
    await assertWorkspaceOwner(ctx, boundWorkspaceId, args.ownerUserId, { requireActive: true });
    return {
      workspaceId: boundWorkspaceId,
      requiresWorkspacePick: false,
    };
  }
  if (args.workspaceId) {
    await assertWorkspaceOwner(ctx, args.workspaceId, args.ownerUserId, { requireActive: true });
    return {
      workspaceId: args.workspaceId,
      requiresWorkspacePick: false,
    };
  }
  return {
    workspaceId: undefined,
    requiresWorkspacePick: true,
  };
}

export async function assertManageableWorkspaceArtifact(
  ctx: QueryCtx | MutationCtx,
  ownerUserId: string,
  artifactId: Id<"artifacts">,
) {
  const artifact = await assertWorkspaceArtifactOwner(ctx, artifactId, ownerUserId, {
    requireActive: true,
  });
  if (!isAgentWritableArtifactType(artifactTypeForLegacyArtifact(artifact))) {
    throw new ConvexError("This artifact type cannot be overwritten by /artifact");
  }
  return artifact;
}

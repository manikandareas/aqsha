import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export async function assertWorkspaceOwner(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<"workspaces">,
  ownerUserId: string,
  options: { requireActive?: boolean } = {},
) {
  const workspace = await ctx.db.get("workspaces", workspaceId);
  if (!workspace || workspace.ownerUserId !== ownerUserId) {
    throw new ConvexError("Workspace not found");
  }
  if (options.requireActive && workspace.status !== "active") {
    throw new ConvexError("Workspace is archived");
  }
  return workspace;
}

export async function assertFolderOwner(
  ctx: QueryCtx | MutationCtx,
  folderId: Id<"workspaceFolders">,
  ownerUserId: string,
  workspaceId?: Id<"workspaces">,
) {
  const folder = await ctx.db.get("workspaceFolders", folderId);
  if (
    !folder ||
    folder.ownerUserId !== ownerUserId ||
    folder.status !== "active" ||
    (workspaceId && folder.workspaceId !== workspaceId)
  ) {
    throw new ConvexError("Folder not found");
  }
  return folder;
}

export async function assertWorkspaceArtifactOwner(
  ctx: QueryCtx | MutationCtx,
  artifactId: Id<"artifacts">,
  ownerUserId: string,
  options: { requireActive?: boolean } = {},
) {
  const artifact = await ctx.db.get("artifacts", artifactId);
  if (!artifact || artifact.ownerUserId !== ownerUserId || !artifact.workspaceId) {
    throw new ConvexError("Artifact not found");
  }
  if (options.requireActive && artifact.status !== "active") {
    throw new ConvexError("Artifact not found");
  }
  return artifact as Doc<"artifacts"> & { workspaceId: Id<"workspaces"> };
}

export async function assertThreadAttachmentOwner(
  ctx: QueryCtx | MutationCtx,
  artifactId: Id<"artifacts">,
  ownerUserId: string,
  options: { requireActive?: boolean; threadId?: string } = {},
) {
  const artifact = await ctx.db.get("artifacts", artifactId);
  if (
    !artifact ||
    artifact.ownerUserId !== ownerUserId ||
    artifact.workspaceId ||
    !artifact.threadId
  ) {
    throw new ConvexError("Attachment not found");
  }
  if (options.threadId && artifact.threadId !== options.threadId) {
    throw new ConvexError("Attachment not found");
  }
  if (options.requireActive && artifact.status !== "active") {
    throw new ConvexError("Attachment not found");
  }
  return artifact as Doc<"artifacts"> & { threadId: string; workspaceId: undefined };
}

export async function assertUploadedArtifactOwner(
  ctx: QueryCtx | MutationCtx,
  artifactId: Id<"artifacts">,
  ownerUserId: string,
  options: { requireActive?: boolean } = {},
) {
  const artifact = await ctx.db.get("artifacts", artifactId);
  if (!artifact || artifact.ownerUserId !== ownerUserId) {
    throw new ConvexError("Artifact not found");
  }
  if (!artifact.workspaceId && !artifact.threadId) {
    throw new ConvexError("Artifact not found");
  }
  if (options.requireActive && artifact.status !== "active") {
    throw new ConvexError("Artifact not found");
  }
  return artifact;
}

export function normalizeName(value: string, label: string) {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    throw new ConvexError(`${label} is required`);
  }
  if (trimmed.length > 120) {
    throw new ConvexError(`${label} is too long`);
  }
  return trimmed;
}

import type { GenericId } from "convex/values";

export type WorkspaceId = GenericId<"workspaces">;
export type ArtifactId = GenericId<"artifacts">;
export type WorkspaceFolderId = GenericId<"workspaceFolders">;

/** Route/param strings are validated by Convex handlers at runtime. */
export function toWorkspaceId(id: string): WorkspaceId {
  return id as WorkspaceId;
}

export function toArtifactId(id: string): ArtifactId {
  return id as ArtifactId;
}

export function toWorkspaceFolderId(id: string): WorkspaceFolderId {
  return id as WorkspaceFolderId;
}

export function toArtifactIds(ids: Iterable<string>): ArtifactId[] {
  return [...ids].map(toArtifactId);
}

import type { GenericId } from "convex/values";

export type WorkspaceId = GenericId<"workspaces">;
export type ArtifactId = GenericId<"artifacts">;
export type WorkspaceFolderId = GenericId<"workspaceFolders">;
// The SDK agent backend (apps/agents) generates run ids as opaque `run_*`
// strings, not Convex document ids — `agent.v2.retryRun` takes `v.string()`.
export type AgentRunId = string;
export type StorageId = GenericId<"_storage">;

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

export function toAgentRunId(id: string): AgentRunId {
  return id;
}

export function toStorageId(id: string): StorageId {
  return id as StorageId;
}

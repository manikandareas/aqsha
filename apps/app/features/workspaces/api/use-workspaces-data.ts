"use client";

import { api } from "@aqsha/convex/api";
import { toArtifactId, toWorkspaceId, type WorkspaceId } from "@/lib/convex-refs";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";

const workspacePageSize = 50;
const artifactPageSize = 100;
const threadPageSize = 30;

export function useWorkspaceIndexData() {
  const { isAuthenticated } = useConvexAuth();
  const viewer = useQuery(api.auth.getCurrentUser, isAuthenticated ? {} : "skip");
  const workspacePage = useQuery(
    api.workspaces.list,
    isAuthenticated
      ? { paginationOpts: { cursor: null, numItems: workspacePageSize } }
      : "skip",
  );
  const threadPage = useQuery(
    api.agent.threads.list,
    isAuthenticated
      ? { paginationOpts: { cursor: null, numItems: threadPageSize } }
      : "skip",
  );

  return {
    isAuthenticated,
    viewer,
    workspaces: workspacePage?.page ?? [],
    threads: threadPage?.page ?? [],
    isLoadingWorkspaces: workspacePage === undefined,
    createWorkspace: useMutation(api.workspaces.create),
    archiveWorkspace: useMutation(api.workspaces.archive),
  };
}

export type WorkspaceDriveData = ReturnType<typeof useWorkspaceDriveData>;

export function useWorkspaceDriveData(workspaceId: string | WorkspaceId) {
  const { isAuthenticated } = useConvexAuth();
  const convexWorkspaceId = workspaceId ? toWorkspaceId(workspaceId) : null;
  const workspaceArgs =
    isAuthenticated && convexWorkspaceId
      ? { workspaceId: convexWorkspaceId }
      : "skip";
  const workspace = useQuery(api.workspaces.get, workspaceArgs);
  const folders = useQuery(api.workspaceFolders.list, workspaceArgs);
  const artifactsPage = useQuery(
    api.artifacts.listByWorkspace,
    isAuthenticated && convexWorkspaceId
      ? {
          workspaceId: convexWorkspaceId,
          paginationOpts: { cursor: null, numItems: artifactPageSize },
        }
      : "skip",
  );

  return {
    workspace,
    folders: folders ?? [],
    artifacts: artifactsPage?.page ?? [],
    isLoading:
      workspace === undefined || folders === undefined || artifactsPage === undefined,
    renameWorkspace: useMutation(api.workspaces.rename),
    archiveWorkspace: useMutation(api.workspaces.archive),
    createFolder: useMutation(api.workspaceFolders.create),
    renameFolder: useMutation(api.workspaceFolders.rename),
    removeFolder: useMutation(api.workspaceFolders.remove),
    createDocument: useMutation(api.artifacts.createDocument),
    createUrl: useMutation(api.artifacts.createUrl),
    renameArtifact: useMutation(api.artifacts.rename),
    moveArtifact: useMutation(api.artifacts.move),
    removeArtifact: useMutation(api.artifacts.remove),
  };
}

export function useWorkspaceDetailData(workspaceId: string) {
  const { isAuthenticated } = useConvexAuth();
  const drive = useWorkspaceDriveData(workspaceId);
  const viewer = useQuery(api.auth.getCurrentUser, isAuthenticated ? {} : "skip");
  const workspacesPage = useQuery(
    api.workspaces.list,
    isAuthenticated
      ? { paginationOpts: { cursor: null, numItems: workspacePageSize } }
      : "skip",
  );
  const threadPage = useQuery(
    api.agent.threads.list,
    isAuthenticated
      ? { paginationOpts: { cursor: null, numItems: threadPageSize } }
      : "skip",
  );
  const workspaceThreadPage = useQuery(
    api.agent.threads.listByWorkspace,
    isAuthenticated && workspaceId
      ? {
          workspaceId: toWorkspaceId(workspaceId),
          paginationOpts: { cursor: null, numItems: threadPageSize },
        }
      : "skip",
  );
  const rateStatus = useQuery(
    api.agent.rateLimits.getSendStatus,
    isAuthenticated ? {} : "skip",
  );

  return {
    isAuthenticated,
    viewer,
    workspace: drive.workspace,
    workspaces: workspacesPage?.page ?? [],
    folders: drive.folders,
    artifacts: drive.artifacts,
    threads: threadPage?.page ?? [],
    workspaceThreads: workspaceThreadPage?.page ?? [],
    rateStatus,
    isLoading: drive.isLoading || workspaceThreadPage === undefined,
    createWorkspace: useMutation(api.workspaces.create),
    renameWorkspace: drive.renameWorkspace,
    archiveWorkspace: drive.archiveWorkspace,
    createFolder: drive.createFolder,
    renameFolder: drive.renameFolder,
    removeFolder: drive.removeFolder,
    createDocument: drive.createDocument,
    createUrl: drive.createUrl,
    renameArtifact: drive.renameArtifact,
    moveArtifact: drive.moveArtifact,
    removeArtifact: drive.removeArtifact,
    startThread: useMutation(api.agent.messages.startThread),
    addThreadContextArtifacts: useMutation(api.agent.threadContext.addMany),
    removeThread: useMutation(api.agent.threads.remove),
  };
}

export function useArtifactDetailData(artifactId: string) {
  const { isAuthenticated } = useConvexAuth();
  const artifactArgs =
    isAuthenticated && artifactId
      ? { artifactId: toArtifactId(artifactId) }
      : "skip";
  const viewer = useQuery(api.auth.getCurrentUser, isAuthenticated ? {} : "skip");
  const workspacesPage = useQuery(
    api.workspaces.list,
    isAuthenticated
      ? { paginationOpts: { cursor: null, numItems: workspacePageSize } }
      : "skip",
  );
  const threadPage = useQuery(
    api.agent.threads.list,
    isAuthenticated
      ? { paginationOpts: { cursor: null, numItems: threadPageSize } }
      : "skip",
  );
  const artifact = useQuery(api.artifacts.get, artifactArgs);

  return {
    isAuthenticated,
    viewer,
    workspaces: workspacesPage?.page ?? [],
    threads: threadPage?.page ?? [],
    artifact,
    isLoading: artifact === undefined,
    getFullContent: useAction(api.artifacts.getFullContent),
    updateDocument: useAction(api.artifacts.updateDocument),
    retryUrlExtraction: useMutation(api.artifacts.retryUrlExtraction),
    renameArtifact: useMutation(api.artifacts.rename),
    moveArtifact: useMutation(api.artifacts.move),
    removeArtifact: useMutation(api.artifacts.remove),
    createWorkspace: useMutation(api.workspaces.create),
  };
}

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
    removeThread: useMutation(api.agent.threads.remove),
  };
}

export type WorkspaceLibraryData = ReturnType<typeof useWorkspaceLibraryData>;

export function useWorkspaceLibraryData(workspaceId: string | WorkspaceId) {
  const { isAuthenticated } = useConvexAuth();
  const convexWorkspaceId = workspaceId ? toWorkspaceId(workspaceId) : null;
  const workspaceArgs =
    isAuthenticated && convexWorkspaceId
      ? { workspaceId: convexWorkspaceId }
      : "skip";
  const workspace = useQuery(api.workspaces.get, workspaceArgs);
  const workspacesPage = useQuery(
    api.workspaces.list,
    isAuthenticated
      ? { paginationOpts: { cursor: null, numItems: workspacePageSize } }
      : "skip",
  );
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
    workspaces: workspacesPage?.page ?? [],
    folders: folders ?? [],
    artifacts: artifactsPage?.page ?? [],
    isLoading:
      workspace === undefined ||
      workspacesPage === undefined ||
      folders === undefined ||
      artifactsPage === undefined,
    renameWorkspace: useMutation(api.workspaces.rename),
    archiveWorkspace: useMutation(api.workspaces.archive),
    createFolder: useMutation(api.workspaceFolders.create),
    renameFolder: useMutation(api.workspaceFolders.rename),
    moveFolder: useMutation(api.workspaceFolders.move),
    removeFolder: useMutation(api.workspaceFolders.remove),
    generateUploadUrl: useMutation(api.artifacts.generateUploadUrl),
    createUploadedArtifact: useAction(api.artifactUploads.createFromStorage),
    createDocument: useMutation(api.artifacts.createDocument),
    createUrl: useMutation(api.artifacts.createUrl),
    renameArtifact: useMutation(api.artifacts.rename),
    moveArtifact: useMutation(api.artifacts.move),
    removeArtifact: useMutation(api.artifacts.remove),
  };
}

export function useWorkspaceDetailData(workspaceId: string) {
  const { isAuthenticated } = useConvexAuth();
  const libraryData = useWorkspaceLibraryData(workspaceId);
  const viewer = useQuery(api.auth.getCurrentUser, isAuthenticated ? {} : "skip");
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
    workspace: libraryData.workspace,
    workspaces: libraryData.workspaces,
    folders: libraryData.folders,
    artifacts: libraryData.artifacts,
    threads: threadPage?.page ?? [],
    workspaceThreads: workspaceThreadPage?.page ?? [],
    rateStatus,
    isLoading: libraryData.isLoading || workspaceThreadPage === undefined,
    createWorkspace: useMutation(api.workspaces.create),
    renameWorkspace: libraryData.renameWorkspace,
    archiveWorkspace: libraryData.archiveWorkspace,
    createFolder: libraryData.createFolder,
    renameFolder: libraryData.renameFolder,
    moveFolder: libraryData.moveFolder,
    removeFolder: libraryData.removeFolder,
    generateUploadUrl: libraryData.generateUploadUrl,
    createUploadedArtifact: libraryData.createUploadedArtifact,
    createDocument: libraryData.createDocument,
    createUrl: libraryData.createUrl,
    renameArtifact: libraryData.renameArtifact,
    moveArtifact: libraryData.moveArtifact,
    removeArtifact: libraryData.removeArtifact,
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
  const paperExtraction = useQuery(api.paperExtractions.getStatus, artifactArgs);

  return {
    isAuthenticated,
    viewer,
    workspaces: workspacesPage?.page ?? [],
    threads: threadPage?.page ?? [],
    artifact,
    paperExtraction,
    isLoading: artifact === undefined,
    getRenderPayload: useAction(api.artifacts.getRenderPayload),
    updateDocument: useAction(api.artifacts.updateDocument),
    retryUrlExtraction: useMutation(api.artifacts.retryUrlExtraction),
    retryGrobidExtraction: useMutation(api.paperExtractions.retryGrobidExtraction),
    renameArtifact: useMutation(api.artifacts.rename),
    moveArtifact: useMutation(api.artifacts.move),
    removeArtifact: useMutation(api.artifacts.remove),
    createWorkspace: useMutation(api.workspaces.create),
    removeThread: useMutation(api.agent.threads.remove),
  };
}

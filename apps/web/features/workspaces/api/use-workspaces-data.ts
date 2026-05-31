"use client";

import { api } from "@aqsha/convex/api";
import { toArtifactId, toWorkspaceId, type WorkspaceId } from "@/lib/convex-refs";
import {
  useConvexActionFn,
  useConvexAuth,
  useConvexMutationFn,
  useConvexQueryData,
} from "@/lib/convex-query";

const workspacePageSize = 50;
const artifactPageSize = 100;
const threadPageSize = 30;

export function useWorkspaceIndexData() {
  const { isAuthenticated } = useConvexAuth();
  const viewer = useConvexQueryData(api.auth.getCurrentUser, isAuthenticated ? {} : "skip");
  const workspacePage = useConvexQueryData(
    api.workspaces.list,
    isAuthenticated
      ? { paginationOpts: { cursor: null, numItems: workspacePageSize } }
      : "skip",
  );
  const threadPage = useConvexQueryData(
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
    createWorkspace: useConvexMutationFn(api.workspaces.create),
    archiveWorkspace: useConvexMutationFn(api.workspaces.archive),
    removeThread: useConvexMutationFn(api.agent.threads.remove),
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
  const workspace = useConvexQueryData(api.workspaces.get, workspaceArgs);
  const workspacesPage = useConvexQueryData(
    api.workspaces.list,
    isAuthenticated
      ? { paginationOpts: { cursor: null, numItems: workspacePageSize } }
      : "skip",
  );
  const folders = useConvexQueryData(api.workspaceFolders.list, workspaceArgs);
  const artifactsPage = useConvexQueryData(
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
    renameWorkspace: useConvexMutationFn(api.workspaces.rename),
    updateWorkspaceEmoji: useConvexMutationFn(api.workspaces.updateEmoji),
    archiveWorkspace: useConvexMutationFn(api.workspaces.archive),
    createFolder: useConvexMutationFn(api.workspaceFolders.create),
    renameFolder: useConvexMutationFn(api.workspaceFolders.rename),
    moveFolder: useConvexMutationFn(api.workspaceFolders.move),
    removeFolder: useConvexMutationFn(api.workspaceFolders.remove),
    generateUploadUrl: useConvexMutationFn(api.artifacts.generateUploadUrl),
    createUploadedArtifact: useConvexActionFn(api.artifactUploads.createFromStorage),
    createDocument: useConvexMutationFn(api.artifacts.createDocument),
    createUrl: useConvexMutationFn(api.artifacts.createUrl),
    renameArtifact: useConvexMutationFn(api.artifacts.rename),
    moveArtifact: useConvexMutationFn(api.artifacts.move),
    removeArtifact: useConvexMutationFn(api.artifacts.remove),
  };
}

export function useWorkspaceDetailData(workspaceId: string) {
  const { isAuthenticated } = useConvexAuth();
  const libraryData = useWorkspaceLibraryData(workspaceId);
  const viewer = useConvexQueryData(api.auth.getCurrentUser, isAuthenticated ? {} : "skip");
  const threadPage = useConvexQueryData(
    api.agent.threads.list,
    isAuthenticated
      ? { paginationOpts: { cursor: null, numItems: threadPageSize } }
      : "skip",
  );
  const workspaceThreadPage = useConvexQueryData(
    api.agent.threads.listByWorkspace,
    isAuthenticated && workspaceId
      ? {
          workspaceId: toWorkspaceId(workspaceId),
          paginationOpts: { cursor: null, numItems: threadPageSize },
        }
      : "skip",
  );
  const rateStatus = useConvexQueryData(
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
    createWorkspace: useConvexMutationFn(api.workspaces.create),
    renameWorkspace: libraryData.renameWorkspace,
    updateWorkspaceEmoji: libraryData.updateWorkspaceEmoji,
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
    startThread: useConvexMutationFn(api.agent.messages.startThread),
    addThreadContextArtifacts: useConvexMutationFn(api.agent.threadContext.addMany),
    removeThread: useConvexMutationFn(api.agent.threads.remove),
  };
}

export function useArtifactDetailData(artifactId: string) {
  const { isAuthenticated } = useConvexAuth();
  const artifactArgs =
    isAuthenticated && artifactId
      ? { artifactId: toArtifactId(artifactId) }
      : "skip";
  const viewer = useConvexQueryData(api.auth.getCurrentUser, isAuthenticated ? {} : "skip");
  const workspacesPage = useConvexQueryData(
    api.workspaces.list,
    isAuthenticated
      ? { paginationOpts: { cursor: null, numItems: workspacePageSize } }
      : "skip",
  );
  const threadPage = useConvexQueryData(
    api.agent.threads.list,
    isAuthenticated
      ? { paginationOpts: { cursor: null, numItems: threadPageSize } }
      : "skip",
  );
  const artifact = useConvexQueryData(api.artifacts.get, artifactArgs);
  const paperExtraction = useConvexQueryData(api.paperExtractions.getStatus, artifactArgs);

  return {
    isAuthenticated,
    viewer,
    workspaces: workspacesPage?.page ?? [],
    threads: threadPage?.page ?? [],
    artifact,
    paperExtraction,
    isLoading: artifact === undefined,
    updateDocument: useConvexActionFn(api.artifacts.updateDocument),
    retryUrlExtraction: useConvexMutationFn(api.artifacts.retryUrlExtraction),
    retryGrobidExtraction: useConvexMutationFn(api.paperExtractions.retryGrobidExtraction),
    renameArtifact: useConvexMutationFn(api.artifacts.rename),
    moveArtifact: useConvexMutationFn(api.artifacts.move),
    removeArtifact: useConvexMutationFn(api.artifacts.remove),
    createWorkspace: useConvexMutationFn(api.workspaces.create),
    removeThread: useConvexMutationFn(api.agent.threads.remove),
  };
}

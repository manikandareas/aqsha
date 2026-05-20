"use client";

import { api } from "@aqsha/convex/api";
import { useConvexAuth, useMutation, useQuery } from "convex/react";

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

export function useWorkspaceDetailData(workspaceId: string) {
  const { isAuthenticated } = useConvexAuth();
  const workspaceArgs =
    isAuthenticated && workspaceId ? { workspaceId: workspaceId as never } : "skip";
  const viewer = useQuery(api.auth.getCurrentUser, isAuthenticated ? {} : "skip");
  const workspacesPage = useQuery(
    api.workspaces.list,
    isAuthenticated
      ? { paginationOpts: { cursor: null, numItems: workspacePageSize } }
      : "skip",
  );
  const workspace = useQuery(api.workspaces.get, workspaceArgs);
  const folders = useQuery(api.workspaceFolders.list, workspaceArgs);
  const artifactsPage = useQuery(
    api.artifacts.listByWorkspace,
    isAuthenticated && workspaceId
      ? {
          workspaceId: workspaceId as never,
          paginationOpts: { cursor: null, numItems: artifactPageSize },
        }
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
          workspaceId: workspaceId as never,
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
    workspace,
    workspaces: workspacesPage?.page ?? [],
    folders: folders ?? [],
    artifacts: artifactsPage?.page ?? [],
    threads: threadPage?.page ?? [],
    workspaceThreads: workspaceThreadPage?.page ?? [],
    rateStatus,
    isLoading:
      workspace === undefined ||
      folders === undefined ||
      artifactsPage === undefined ||
      workspaceThreadPage === undefined,
    createWorkspace: useMutation(api.workspaces.create),
    renameWorkspace: useMutation(api.workspaces.rename),
    archiveWorkspace: useMutation(api.workspaces.archive),
    createFolder: useMutation(api.workspaceFolders.create),
    renameFolder: useMutation(api.workspaceFolders.rename),
    removeFolder: useMutation(api.workspaceFolders.remove),
    createDocument: useMutation(api.artifacts.createDocument),
    renameArtifact: useMutation(api.artifacts.rename),
    moveArtifact: useMutation(api.artifacts.move),
    removeArtifact: useMutation(api.artifacts.remove),
    startThread: useMutation(api.agent.messages.startThread),
  };
}

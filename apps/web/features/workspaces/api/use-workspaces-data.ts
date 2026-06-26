"use client";

import { useAuth } from "@clerk/nextjs";
import { useMemo } from "react";
import {
  useCreateDocument,
  useDeleteArtifact,
  useMoveArtifact,
  useRenameArtifact,
  useRetryUrlExtraction,
  useSaveUrl,
  useUpdateDocument,
  useUploadArtifact,
  useArtifact,
  useArtifactRender,
  useArtifacts,
} from "@/features/artifacts/api";
import { useProfile } from "@/features/settings/api";
import {
  useDeleteThread,
  useSendStatus,
  useThreadsList,
} from "@/features/threads/api";
import {
  useArchiveWorkspace,
  useCreateFolder,
  useCreateWorkspace,
  useDeleteFolder,
  useFolders,
  useMoveFolder,
  useRenameFolder,
  useUpdateWorkspace,
  useWorkspace,
  useWorkspacesList,
} from "@/features/workspaces/api";
import type { WorkspaceId } from "@/lib/convex-refs";
import type { WorkspaceArtifact } from "../utils/workspace-library-model";

function flattenWorkspaces(
  pages:
    | Array<{
        items: Array<{
          id: string;
          name: string;
          emoji: string | null;
          updatedAt: number;
        }>;
      }>
    | undefined,
) {
  return (pages ?? []).flatMap((page) =>
    page.items.map((workspace) => ({
      _id: workspace.id,
      name: workspace.name,
      emoji: workspace.emoji ?? undefined,
      updatedAt: workspace.updatedAt,
    })),
  );
}

function flattenThreads(
  pages:
    | Array<{
        items: Array<{
          id: string;
          title: string | null;
          lastActivityAt: number;
          lastMessagePreview: string | null;
          status: string;
          agentKind: string;
          createdAt: number;
          workspaceId?: string | null;
          bucket?: "recent" | "older";
        }>;
      }>
    | undefined,
) {
  return (pages ?? []).flatMap((page) =>
    page.items.map((thread) => ({
      threadId: thread.id,
      title: thread.title?.trim() ? thread.title : "Percakapan baru",
      createdAt: thread.createdAt,
      lastActivityAt: thread.lastActivityAt,
      lastMessagePreview: thread.lastMessagePreview ?? "",
      messageCount: 0,
      status: thread.status as "idle" | "streaming" | "failed",
      lastAgentKind: thread.agentKind as "lite" | "pro" | undefined,
      workspaceId: thread.workspaceId ?? undefined,
      bucket: thread.bucket,
    })),
  );
}

function flattenArtifacts(
  pages:
    | Array<{
        items: Array<{
          _id: string;
          title: string;
          artifactType: string;
          workspaceId: string | null;
          folderId: string | null;
          createdAt: number;
          updatedAt: number;
          mimeType?: string | null;
          url?: string | null;
        }>;
      }>
    | undefined,
) {
  return (pages ?? []).flatMap((page) =>
    page.items.map((artifact) => ({
      _id: artifact._id,
      title: artifact.title,
      kind: artifact.artifactType,
      artifactType: artifact.artifactType,
      workspaceId: artifact.workspaceId ?? "",
      folderId: artifact.folderId ?? undefined,
      createdAt: artifact.createdAt,
      updatedAt: artifact.updatedAt,
      mimeType: artifact.mimeType ?? undefined,
      url: artifact.url ?? undefined,
    })),
  ) as WorkspaceArtifact[];
}

export function useWorkspaceIndexData() {
  const { isLoaded, isSignedIn } = useAuth();
  const isAuthenticated = isLoaded && isSignedIn;
  const profile = useProfile();
  const workspacesQuery = useWorkspacesList(false);
  const threadsQuery = useThreadsList();
  const createWorkspaceMutation = useCreateWorkspace();
  const archiveWorkspaceMutation = useArchiveWorkspace();
  const deleteThreadMutation = useDeleteThread();

  const viewer = profile.data
    ? {
        name: profile.data.name,
        email: profile.data.email,
        image: profile.data.image,
      }
    : undefined;

  return {
    isAuthenticated,
    viewer,
    workspaces: flattenWorkspaces(workspacesQuery.data?.pages),
    threads: flattenThreads(threadsQuery.data?.pages),
    isLoadingWorkspaces: workspacesQuery.isLoading,
    createWorkspace: async (args: { name: string }) => {
      const workspace = await createWorkspaceMutation.mutateAsync(args);
      return "id" in workspace ? workspace.id : String(workspace);
    },
    archiveWorkspace: async (args: { workspaceId: string }) => {
      await archiveWorkspaceMutation.mutateAsync({ id: args.workspaceId });
    },
    removeThread: async (args: { threadId: string }) => {
      await deleteThreadMutation.mutateAsync({ id: args.threadId });
      return { ok: true as const };
    },
  };
}

export type WorkspaceLibraryData = ReturnType<typeof useWorkspaceLibraryData>;

export function useWorkspaceLibraryData(workspaceId: string | WorkspaceId) {
  const activeWorkspaceId = workspaceId || "";
  const workspaceQuery = useWorkspace(activeWorkspaceId);
  const workspacesQuery = useWorkspacesList(false);
  const foldersQuery = useFolders(activeWorkspaceId);
  const artifactsQuery = useArtifacts(activeWorkspaceId);
  const updateWorkspaceMutation = useUpdateWorkspace();
  const archiveWorkspaceMutation = useArchiveWorkspace();
  const createFolderMutation = useCreateFolder();
  const renameFolderMutation = useRenameFolder();
  const moveFolderMutation = useMoveFolder();
  const deleteFolderMutation = useDeleteFolder();
  const createDocumentMutation = useCreateDocument(activeWorkspaceId);
  const saveUrlMutation = useSaveUrl();
  const renameArtifactMutation = useRenameArtifact();
  const moveArtifactMutation = useMoveArtifact();
  const deleteArtifactMutation = useDeleteArtifact();
  const uploadArtifactMutation = useUploadArtifact(activeWorkspaceId);

  const workspace = workspaceQuery.data
    ? {
        _id: workspaceQuery.data.id,
        name: workspaceQuery.data.name,
        emoji: workspaceQuery.data.emoji ?? undefined,
        updatedAt: workspaceQuery.data.updatedAt,
      }
    : workspaceQuery.isLoading
      ? undefined
      : null;

  const folders = (Array.isArray(foldersQuery.data)
    ? foldersQuery.data
    : (foldersQuery.data?.items ?? [])
  ).map((folder: { id: string; name: string; workspaceId: string; createdAt: number; updatedAt: number }) => ({
    _id: folder.id,
    name: folder.name,
    workspaceId: folder.workspaceId,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
  }));

  return {
    workspace,
    workspaces: flattenWorkspaces(workspacesQuery.data?.pages),
    folders,
    artifacts: flattenArtifacts(artifactsQuery.data?.pages),
    isLoading:
      workspaceQuery.isLoading ||
      workspacesQuery.isLoading ||
      foldersQuery.isLoading ||
      artifactsQuery.isLoading,
    renameWorkspace: async (args: { workspaceId: string; name: string }) => {
      await updateWorkspaceMutation.mutateAsync({ id: args.workspaceId, name: args.name });
    },
    updateWorkspaceEmoji: async (args: { workspaceId: string; emoji: string }) => {
      await updateWorkspaceMutation.mutateAsync({ id: args.workspaceId, emoji: args.emoji });
    },
    archiveWorkspace: async (args: { workspaceId: string }) => {
      await archiveWorkspaceMutation.mutateAsync({ id: args.workspaceId });
    },
    createFolder: async (args: { workspaceId: string; name: string }) => {
      await createFolderMutation.mutateAsync(args);
    },
    renameFolder: async (args: { folderId: string; name: string; workspaceId?: string }) => {
      await renameFolderMutation.mutateAsync({
        id: args.folderId,
        workspaceId: args.workspaceId ?? activeWorkspaceId,
        name: args.name,
      });
    },
    moveFolder: async (args: {
      folderId: string;
      targetWorkspaceId: string;
      workspaceId?: string;
    }) => {
      await moveFolderMutation.mutateAsync({
        id: args.folderId,
        workspaceId: args.workspaceId ?? activeWorkspaceId,
        targetWorkspaceId: args.targetWorkspaceId,
      });
    },
    removeFolder: async (args: { folderId: string; workspaceId?: string }) => {
      await deleteFolderMutation.mutateAsync({
        id: args.folderId,
        workspaceId: args.workspaceId ?? activeWorkspaceId,
      });
    },
    createDocument: async (args: { workspaceId: string; folderId?: string; title?: string }) => {
      const result = await createDocumentMutation.mutateAsync({
        folderId: args.folderId,
        title: args.title,
      });
      return result.artifactId;
    },
    createUrl: async (args: {
      workspaceId: string;
      url: string;
      title?: string;
      folderId?: string;
    }) => {
      const result = await saveUrlMutation.mutateAsync(args);
      return result.artifactId;
    },
    renameArtifact: async (args: { artifactId: string; title: string }) => {
      await renameArtifactMutation.mutateAsync({ id: args.artifactId, title: args.title });
    },
    uploadArtifact: uploadArtifactMutation,
    updateDocument: async () => undefined,
    moveArtifact: async (args: {
      artifactId: string;
      folderId?: string;
      targetWorkspaceId?: string;
    }) => {
      await moveArtifactMutation.mutateAsync({
        id: args.artifactId,
        ...(args.targetWorkspaceId ? { targetWorkspaceId: args.targetWorkspaceId } : {}),
        ...(args.folderId !== undefined ? { folderId: args.folderId ?? null } : {}),
      });
    },
    removeArtifact: async (args: { artifactId: string }) => {
      await deleteArtifactMutation.mutateAsync({ id: args.artifactId });
      return { ok: true as const };
    },
  };
}

export function useWorkspaceDetailData(workspaceId: string) {
  const index = useWorkspaceIndexData();
  const library = useWorkspaceLibraryData(workspaceId);
  const rateStatus = useSendStatus();
  const workspaceThreads = useMemo(
    () => index.threads.filter((thread) => thread.workspaceId === workspaceId),
    [index.threads, workspaceId],
  );

  return {
    isAuthenticated: index.isAuthenticated,
    viewer: index.viewer,
    workspace: library.workspace,
    workspaces: library.workspaces,
    folders: library.folders,
    artifacts: library.artifacts,
    threads: index.threads,
    workspaceThreads,
    rateStatus: rateStatus.data
      ? {
          ok: rateStatus.data.canSend,
          serverTime: 0,
          canSend: rateStatus.data.canSend,
          reason: rateStatus.data.reason,
          retryAt: rateStatus.data.retryAt,
        }
      : undefined,
    isLoading: library.isLoading,
    createWorkspace: index.createWorkspace,
    renameWorkspace: library.renameWorkspace,
    updateWorkspaceEmoji: library.updateWorkspaceEmoji,
    archiveWorkspace: library.archiveWorkspace,
    createFolder: library.createFolder,
    renameFolder: library.renameFolder,
    moveFolder: library.moveFolder,
    removeFolder: library.removeFolder,
    createDocument: library.createDocument,
    createUrl: library.createUrl,
    renameArtifact: library.renameArtifact,
    moveArtifact: library.moveArtifact,
    removeArtifact: library.removeArtifact,
    uploadArtifact: library.uploadArtifact,
    updateDocument: library.updateDocument,
    removeThread: index.removeThread,
  };
}

export function useArtifactDetailData(artifactId: string) {
  const index = useWorkspaceIndexData();
  const artifactQuery = useArtifact(artifactId);
  const renderQuery = useArtifactRender(artifactId);
  const updateDocumentMutation = useUpdateDocument(artifactId);
  const retryUrlMutation = useRetryUrlExtraction(artifactId);
  const renameArtifactMutation = useRenameArtifact();
  const moveArtifactMutation = useMoveArtifact();
  const deleteArtifactMutation = useDeleteArtifact();

  return {
    isAuthenticated: index.isAuthenticated,
    viewer: index.viewer,
    workspaces: index.workspaces,
    threads: index.threads,
    artifact: artifactQuery.data ?? (artifactQuery.isLoading ? undefined : null),
    paperExtraction: undefined,
    renderPayload: renderQuery.data,
    isLoading: artifactQuery.isLoading || renderQuery.isLoading,
    updateDocument: async (args: {
      title?: string;
      blocksJson?: string;
      markdown?: string;
      plainText: string;
    }) => {
      await updateDocumentMutation.mutateAsync(args);
    },
    retryUrlExtraction: async () => {
      await retryUrlMutation.mutateAsync();
    },
    retryGrobidExtraction: async () => ({ ok: false as const, reason: "not_available" as const }),
    renameArtifact: async (args: { artifactId: string; title: string }) => {
      await renameArtifactMutation.mutateAsync({ id: args.artifactId, title: args.title });
    },
    moveArtifact: async (args: { artifactId: string; targetWorkspaceId: string }) => {
      await moveArtifactMutation.mutateAsync({
        id: args.artifactId,
        targetWorkspaceId: args.targetWorkspaceId,
      });
    },
    removeArtifact: async (args: { artifactId: string }) => {
      await deleteArtifactMutation.mutateAsync({ id: args.artifactId });
      return { ok: true as const };
    },
    createWorkspace: index.createWorkspace,
    removeThread: index.removeThread,
  };
}

"use client";

import { useRouter } from "next/navigation";
import {
  toArtifactId,
  toWorkspaceFolderId,
  toWorkspaceId,
  type ArtifactId,
  type WorkspaceFolderId,
  type WorkspaceId,
} from "@/lib/convex-refs";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { NameDialog, UrlDialog } from "./workspace-dialogs";
import type { useWorkspaceLibraryDialogState } from "../hooks/use-workspace-library-dialogs";

type DialogState = ReturnType<typeof useWorkspaceLibraryDialogState>;

type WorkspaceLibraryMutations = {
  archiveWorkspace: (args: { workspaceId: WorkspaceId }) => Promise<unknown>;
  createFolder: (args: { workspaceId: WorkspaceId; name: string }) => Promise<unknown>;
  createDocument: (args: {
    workspaceId: WorkspaceId;
    folderId?: WorkspaceFolderId;
    title: string;
  }) => Promise<unknown>;
  createUrl: (args: {
    workspaceId: WorkspaceId;
    folderId?: WorkspaceFolderId;
    url: string;
    title?: string;
  }) => Promise<unknown>;
  renameFolder: (args: { folderId: WorkspaceFolderId; name: string }) => Promise<unknown>;
  renameArtifact: (args: { artifactId: ArtifactId; title: string }) => Promise<unknown>;
  removeFolder: (args: { folderId: WorkspaceFolderId }) => Promise<unknown>;
  removeArtifact: (args: { artifactId: ArtifactId }) => Promise<unknown>;
};

export function WorkspaceLibraryDialogsStack({
  workspaceId,
  activeFolderId,
  activeFolderName,
  mutations,
  dialogState,
  onAfterArchive,
}: {
  workspaceId: string;
  activeFolderId: "root" | string;
  activeFolderName?: string;
  mutations: WorkspaceLibraryMutations;
  dialogState: DialogState;
  onAfterArchive?: () => void;
}) {
  const router = useRouter();
  const folderIdForCreate =
    activeFolderId === "root" ? undefined : toWorkspaceFolderId(activeFolderId);
  const convexWorkspaceId = toWorkspaceId(workspaceId);
  const {
    archiveWorkspaceOpen,
    setArchiveWorkspaceOpen,
    createFolderOpen,
    setCreateFolderOpen,
    createDocumentOpen,
    setCreateDocumentOpen,
    createUrlOpen,
    setCreateUrlOpen,
    renameFolder,
    setRenameFolder,
    deleteFolder,
    setDeleteFolder,
    renameArtifact,
    setRenameArtifact,
    deleteArtifact,
    setDeleteArtifact,
  } = dialogState;

  const openCreatedArtifact = (artifactId: unknown) => {
    router.push(`/app/workspaces/${workspaceId}/artifacts/${String(artifactId)}`);
  };

  return (
    <>
      <NameDialog
        open={createFolderOpen}
        onOpenChange={setCreateFolderOpen}
        title="Folder baru"
        description="Buat folder satu level."
        submitLabel="Buat"
        onSubmit={async ({ name }) => {
          await mutations.createFolder({ workspaceId: convexWorkspaceId, name });
        }}
      />
      <NameDialog
        open={createDocumentOpen}
        onOpenChange={setCreateDocumentOpen}
        title="Dokumen baru"
        description="Buat placeholder dokumen."
        submitLabel="Buat"
        onSubmit={async ({ name }) => {
          const artifactId = await mutations.createDocument({
            workspaceId: convexWorkspaceId,
            folderId: folderIdForCreate,
            title: name,
          });
          openCreatedArtifact(artifactId);
        }}
      />
      <UrlDialog
        open={createUrlOpen}
        folderName={activeFolderName}
        onOpenChange={setCreateUrlOpen}
        onSubmit={async ({ url, title }) => {
          // Stay on the workspace board: the new card appears immediately in a
          // loading state and "matures" in place once ingestion completes.
          await mutations.createUrl({
            workspaceId: convexWorkspaceId,
            folderId: folderIdForCreate,
            url,
            title: title?.trim() || undefined,
          });
        }}
      />
      <NameDialog
        open={Boolean(renameFolder)}
        onOpenChange={(open) => !open && setRenameFolder(null)}
        title="Rename folder"
        description="Perbarui nama folder."
        submitLabel="Simpan"
        initialName={renameFolder?.name}
        onSubmit={async ({ name }) => {
          if (renameFolder) {
            await mutations.renameFolder({
              folderId: toWorkspaceFolderId(renameFolder._id),
              name,
            });
          }
        }}
      />
      <NameDialog
        open={Boolean(renameArtifact)}
        onOpenChange={(open) => !open && setRenameArtifact(null)}
        title="Rename artifact"
        description="Perbarui judul artifact."
        submitLabel="Simpan"
        initialName={renameArtifact?.title}
        onSubmit={async ({ name }) => {
          if (renameArtifact) {
            await mutations.renameArtifact({
              artifactId: toArtifactId(renameArtifact._id),
              title: name,
            });
          }
        }}
      />
      <ConfirmDialog
        open={archiveWorkspaceOpen}
        onOpenChange={setArchiveWorkspaceOpen}
        title="Archive workspace"
        description="Workspace ini disembunyikan dari daftar aktif."
        confirmLabel="Archive"
        onConfirm={async () => {
          await mutations.archiveWorkspace({ workspaceId: convexWorkspaceId });
          onAfterArchive?.();
        }}
      />
      <ConfirmDialog
        open={Boolean(deleteFolder)}
        onOpenChange={(open) => !open && setDeleteFolder(null)}
        title="Delete folder"
        description="Artifact aktif di folder ini akan kembali ke tingkat Semua file."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (deleteFolder) {
            await mutations.removeFolder({
              folderId: toWorkspaceFolderId(deleteFolder._id),
            });
          }
        }}
      />
      <ConfirmDialog
        open={Boolean(deleteArtifact)}
        onOpenChange={(open) => !open && setDeleteArtifact(null)}
        title="Delete artifact"
        description="Artifact ini disembunyikan dari library."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (deleteArtifact) {
            await mutations.removeArtifact({
              artifactId: toArtifactId(deleteArtifact._id),
            });
          }
        }}
      />
    </>
  );
}

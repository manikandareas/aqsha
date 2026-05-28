"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toArtifactId, toWorkspaceFolderId, toWorkspaceId } from "@/lib/convex-refs";
import { useCloseRightPanel } from "@/hooks/use-close-right-panel";
import type { WorkspaceDriveData } from "../api/use-workspaces-data";
import type { useWorkspaceLibraryDialogState } from "../hooks/use-workspace-library-dialogs";
import { uploadWorkspaceFiles } from "../utils/workspace-file-upload";
import { WorkspaceDriveLibrary } from "./workspace-drive-library";
import { WorkspaceLibraryDialogsStack } from "./workspace-library-dialogs-stack";

type DialogState = ReturnType<typeof useWorkspaceLibraryDialogState>;

type LibraryDriveProps = Pick<
  WorkspaceDriveData,
  "folders" | "artifacts" | "moveArtifact" | "workspace"
> & {
  workspaces: WorkspaceDriveData["workspaces"];
  renameWorkspace: WorkspaceDriveData["renameWorkspace"];
  archiveWorkspace: WorkspaceDriveData["archiveWorkspace"];
  createFolder: WorkspaceDriveData["createFolder"];
  moveFolder: WorkspaceDriveData["moveFolder"];
  createDocument: WorkspaceDriveData["createDocument"];
  createUrl: WorkspaceDriveData["createUrl"];
  renameFolder: WorkspaceDriveData["renameFolder"];
  generateUploadUrl: WorkspaceDriveData["generateUploadUrl"];
  createUploadedArtifact: WorkspaceDriveData["createUploadedArtifact"];
  renameArtifact: WorkspaceDriveData["renameArtifact"];
  removeFolder: WorkspaceDriveData["removeFolder"];
  removeArtifact: WorkspaceDriveData["removeArtifact"];
};

export function WorkspaceLibrarySurface({
  workspaceId,
  workspaceName,
  titleSlot,
  drive,
  dialogState,
  activeFolderId,
  onActiveFolderChange,
  isArtifactSelected,
  onToggleArtifactContext,
  onAfterArchive,
  showLeftSidebarTrigger,
  onToggleLeftSidebar,
  chatPanelOpen,
  onToggleChatPanel,
  onClosePanel,
  showCreateActions,
  showWorkspaceSettings,
}: {
  workspaceId: string;
  workspaceName: string;
  titleSlot?: ReactNode;
  drive: LibraryDriveProps;
  dialogState: DialogState;
  activeFolderId: "root" | string;
  onActiveFolderChange: (folderId: "root" | string) => void;
  isArtifactSelected: (artifactId: string) => boolean;
  onToggleArtifactContext: (artifactId: string) => void;
  onAfterArchive: () => void;
  showLeftSidebarTrigger?: boolean;
  onToggleLeftSidebar?: () => void;
  chatPanelOpen?: boolean;
  onToggleChatPanel?: () => void;
  onClosePanel?: () => void;
  showCreateActions?: boolean;
  showWorkspaceSettings?: boolean;
}) {
  const router = useRouter();
  const closePanel = useCloseRightPanel();
  // Main board uses Chat toggle; side-panel embeds use close only (mutually exclusive in toolbar).
  const panelCloseHandler = onToggleChatPanel ? undefined : (onClosePanel ?? closePanel);

  const libraryMutations = {
    renameWorkspace: drive.renameWorkspace,
    archiveWorkspace: drive.archiveWorkspace,
    createFolder: drive.createFolder,
    createDocument: drive.createDocument,
    createUrl: drive.createUrl,
    renameFolder: drive.renameFolder,
    renameArtifact: drive.renameArtifact,
    removeFolder: drive.removeFolder,
    removeArtifact: drive.removeArtifact,
  };

  return (
    <>
      <WorkspaceDriveLibrary
        workspaceName={workspaceName}
        workspaceId={workspaceId}
        titleSlot={titleSlot}
        onActiveFolderChange={onActiveFolderChange}
        folders={drive.folders}
        artifacts={drive.artifacts}
        workspaces={drive.workspaces}
        {...dialogState.libraryHandlers}
        isArtifactSelected={isArtifactSelected}
        onToggleArtifactContext={onToggleArtifactContext}
        onOpenArtifact={(artifactId) =>
          router.push(`/workspaces/${workspaceId}/artifacts/${artifactId}`)
        }
        onMoveArtifact={async (artifactId, target) => {
          await drive.moveArtifact({
            artifactId: toArtifactId(artifactId),
            folderId: target === "root" ? undefined : toWorkspaceFolderId(target),
          });
        }}
        onMoveArtifactToWorkspace={async (artifactId, targetWorkspaceId) => {
          await drive.moveArtifact({
            artifactId: toArtifactId(artifactId),
            targetWorkspaceId: toWorkspaceId(targetWorkspaceId),
          });
        }}
        onMoveFolderToWorkspace={async (folderId, targetWorkspaceId) => {
          await drive.moveFolder({
            folderId: toWorkspaceFolderId(folderId),
            targetWorkspaceId: toWorkspaceId(targetWorkspaceId),
          });
        }}
        onUploadFiles={async (files, folderId, options) => {
          return await uploadWorkspaceFiles({
            files,
            workspaceId,
            folderId,
            generateUploadUrl: drive.generateUploadUrl,
            createUploadedArtifact: drive.createUploadedArtifact,
            onFileChange: options?.onFileChange,
          });
        }}
        chatPanelOpen={chatPanelOpen}
        onToggleChatPanel={onToggleChatPanel}
        onClosePanel={panelCloseHandler}
        showLeftSidebarTrigger={showLeftSidebarTrigger}
        onToggleLeftSidebar={onToggleLeftSidebar}
        showCreateActions={showCreateActions}
        showWorkspaceSettings={showWorkspaceSettings}
      />
      <WorkspaceLibraryDialogsStack
        workspaceId={workspaceId}
        workspaceName={drive.workspace?.name ?? workspaceName}
        activeFolderId={activeFolderId}
        mutations={libraryMutations}
        dialogState={dialogState}
        onAfterArchive={onAfterArchive}
      />
    </>
  );
}

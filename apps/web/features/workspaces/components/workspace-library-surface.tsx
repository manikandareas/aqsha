"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toArtifactId, toWorkspaceFolderId, toWorkspaceId } from "@/lib/convex-refs";
import { useCloseRightPanel } from "@/hooks/use-close-right-panel";
import type { WorkspaceLibraryData } from "../api/use-workspaces-data";
import type { useWorkspaceLibraryDialogState } from "../hooks/use-workspace-library-dialogs";
import { uploadWorkspaceFiles } from "../utils/workspace-file-upload";
import { WorkspaceLibraryBoard } from "./workspace-library-board";
import { WorkspaceLibraryDialogsStack } from "./workspace-library-dialogs-stack";

type DialogState = ReturnType<typeof useWorkspaceLibraryDialogState>;

type LibraryDataProps = Pick<
  WorkspaceLibraryData,
  "folders" | "artifacts" | "moveArtifact" | "workspace"
> & {
  workspaces: WorkspaceLibraryData["workspaces"];
  renameWorkspace: WorkspaceLibraryData["renameWorkspace"];
  archiveWorkspace: WorkspaceLibraryData["archiveWorkspace"];
  createFolder: WorkspaceLibraryData["createFolder"];
  moveFolder: WorkspaceLibraryData["moveFolder"];
  createDocument: WorkspaceLibraryData["createDocument"];
  createUrl: WorkspaceLibraryData["createUrl"];
  renameFolder: WorkspaceLibraryData["renameFolder"];
  generateUploadUrl: WorkspaceLibraryData["generateUploadUrl"];
  createUploadedArtifact: WorkspaceLibraryData["createUploadedArtifact"];
  renameArtifact: WorkspaceLibraryData["renameArtifact"];
  removeFolder: WorkspaceLibraryData["removeFolder"];
  removeArtifact: WorkspaceLibraryData["removeArtifact"];
};

export function WorkspaceLibrarySurface({
  workspaceId,
  workspaceName,
  titleSlot,
  libraryData,
  dialogState,
  activeFolderId,
  onActiveFolderChange,
  isArtifactSelected,
  onToggleArtifactContext,
  onSetArtifactContextSelection,
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
  libraryData: LibraryDataProps;
  dialogState: DialogState;
  activeFolderId: "root" | string;
  onActiveFolderChange: (folderId: "root" | string) => void;
  isArtifactSelected: (artifactId: string) => boolean;
  onToggleArtifactContext: (artifactId: string) => void;
  onSetArtifactContextSelection: (artifactIds: string[]) => void;
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
    renameWorkspace: libraryData.renameWorkspace,
    archiveWorkspace: libraryData.archiveWorkspace,
    createFolder: libraryData.createFolder,
    createDocument: libraryData.createDocument,
    createUrl: libraryData.createUrl,
    renameFolder: libraryData.renameFolder,
    renameArtifact: libraryData.renameArtifact,
    removeFolder: libraryData.removeFolder,
    removeArtifact: libraryData.removeArtifact,
  };

  return (
    <>
      <WorkspaceLibraryBoard
        workspaceName={workspaceName}
        workspaceId={workspaceId}
        titleSlot={titleSlot}
        onActiveFolderChange={onActiveFolderChange}
        folders={libraryData.folders}
        artifacts={libraryData.artifacts}
        workspaces={libraryData.workspaces}
        {...dialogState.libraryHandlers}
        isArtifactSelected={isArtifactSelected}
        onToggleArtifactContext={onToggleArtifactContext}
        onSetArtifactContextSelection={onSetArtifactContextSelection}
        onOpenArtifact={(artifactId) =>
          router.push(`/app/workspaces/${workspaceId}/artifacts/${artifactId}`)
        }
        onMoveArtifact={async (artifactId, target) => {
          await libraryData.moveArtifact({
            artifactId: toArtifactId(artifactId),
            folderId: target === "root" ? undefined : toWorkspaceFolderId(target),
          });
        }}
        onMoveArtifactToWorkspace={async (artifactId, targetWorkspaceId) => {
          await libraryData.moveArtifact({
            artifactId: toArtifactId(artifactId),
            targetWorkspaceId: toWorkspaceId(targetWorkspaceId),
          });
        }}
        onMoveFolderToWorkspace={async (folderId, targetWorkspaceId) => {
          await libraryData.moveFolder({
            folderId: toWorkspaceFolderId(folderId),
            targetWorkspaceId: toWorkspaceId(targetWorkspaceId),
          });
        }}
        onUploadFiles={async (files, folderId, options) => {
          return await uploadWorkspaceFiles({
            files,
            workspaceId,
            folderId,
            generateUploadUrl: libraryData.generateUploadUrl,
            createUploadedArtifact: libraryData.createUploadedArtifact,
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
        workspaceName={libraryData.workspace?.name ?? workspaceName}
        activeFolderId={activeFolderId}
        mutations={libraryMutations}
        dialogState={dialogState}
        onAfterArchive={onAfterArchive}
      />
    </>
  );
}

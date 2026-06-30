"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  parseAsArrayOf,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from "nuqs";
import { toArtifactId, toWorkspaceFolderId, toWorkspaceId } from "@/lib/convex-refs";
import { useCloseRightPanel } from "@/hooks/use-close-right-panel";
import type { WorkspaceLibraryData } from "../api/use-workspaces-data";
import type { useWorkspaceLibraryDialogState } from "../hooks/use-workspace-library-dialogs";
import {
  defaultWorkspaceArtifactSort,
  workspaceArtifactTypes,
  type WorkspaceArtifactSort,
  type WorkspaceArtifactType,
} from "../utils/workspace-library-model";
import { uploadWorkspaceFiles } from "../utils/workspace-file-upload";
import { WorkspaceLibraryBoard } from "./workspace-library-board";
import { WorkspaceLibraryDialogsStack } from "./workspace-library-dialogs-stack";

type DialogState = ReturnType<typeof useWorkspaceLibraryDialogState>;

const workspaceArtifactSortOptions = [
  "updated-desc",
  "updated-asc",
  "created-desc",
  "created-asc",
  "title-asc",
  "title-desc",
] as const satisfies readonly WorkspaceArtifactSort[];

const workspaceLibraryTabs = ["pustaka", "artifact"] as const;
export type WorkspaceLibraryTab = (typeof workspaceLibraryTabs)[number];

const workspaceLibraryQueryParsers = {
  q: parseAsString.withDefault(""),
  type: parseAsArrayOf(parseAsStringLiteral(workspaceArtifactTypes)).withDefault([]),
  sort: parseAsStringLiteral(workspaceArtifactSortOptions).withDefault(defaultWorkspaceArtifactSort),
  tab: parseAsStringLiteral(workspaceLibraryTabs).withDefault("pustaka"),
};

type LibraryDataProps = Pick<
  WorkspaceLibraryData,
  "folders" | "artifacts" | "moveArtifact" | "workspace"
> & {
  workspaces: WorkspaceLibraryData["workspaces"];
  renameWorkspace: WorkspaceLibraryData["renameWorkspace"];
  updateWorkspaceEmoji: WorkspaceLibraryData["updateWorkspaceEmoji"];
  archiveWorkspace: WorkspaceLibraryData["archiveWorkspace"];
  createFolder: WorkspaceLibraryData["createFolder"];
  moveFolder: WorkspaceLibraryData["moveFolder"];
  createDocument: WorkspaceLibraryData["createDocument"];
  createUrl: WorkspaceLibraryData["createUrl"];
  renameFolder: WorkspaceLibraryData["renameFolder"];
  uploadArtifact: WorkspaceLibraryData["uploadArtifact"];
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
  getArtifactSelected,
  onToggleArtifactContext,
  onSetArtifactContextSelection,
  contextCount,
  onAfterArchive,
  showLeftSidebarTrigger,
  onToggleLeftSidebar,
  chatPanelOpen,
  onToggleChatPanel,
  onClosePanel,
  showCreateActions,
  showWorkspaceSettings,
  variant,
}: {
  workspaceId: string;
  workspaceName: string;
  titleSlot?: ReactNode;
  libraryData: LibraryDataProps;
  dialogState: DialogState;
  getArtifactSelected: (artifactId: string) => boolean;
  onToggleArtifactContext: (artifactId: string) => void;
  onSetArtifactContextSelection: (artifactIds: string[]) => void;
  contextCount?: number;
  onAfterArchive: () => void;
  showLeftSidebarTrigger?: boolean;
  onToggleLeftSidebar?: () => void;
  chatPanelOpen?: boolean;
  onToggleChatPanel?: () => void;
  onClosePanel?: () => void;
  showCreateActions?: boolean;
  showWorkspaceSettings?: boolean;
  variant?: "page" | "panel";
}) {
  const router = useRouter();
  const closePanel = useCloseRightPanel();
  const [libraryControls, setLibraryControls] = useQueryStates(
    workspaceLibraryQueryParsers,
    { history: "replace" },
  );
  // Main board uses Chat toggle; side-panel embeds use close only (mutually exclusive in toolbar).
  const panelCloseHandler = onToggleChatPanel ? undefined : (onClosePanel ?? closePanel);
  const currentWorkspaceName = libraryData.workspace?.name ?? workspaceName;
  const currentWorkspaceEmoji = libraryData.workspace?.emoji;

  const libraryMutations = {
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
        workspaceName={currentWorkspaceName}
        workspaceEmoji={currentWorkspaceEmoji}
        workspaceId={workspaceId}
        titleSlot={titleSlot}
        folders={libraryData.folders}
        artifacts={libraryData.artifacts}
        searchQuery={libraryControls.q}
        selectedTypes={dedupeArtifactTypes(libraryControls.type)}
        sort={libraryControls.sort}
        onSearchQueryChange={(query) => {
          void setLibraryControls({ q: query });
        }}
        onToggleType={(type) => {
          const current = dedupeArtifactTypes(libraryControls.type);
          const next = current.includes(type)
            ? current.filter((item) => item !== type)
            : [...current, type];
          void setLibraryControls({ type: next });
        }}
        onSortChange={(sort) => {
          void setLibraryControls({ sort });
        }}
        activeTab={libraryControls.tab}
        onTabChange={(tab) => {
          void setLibraryControls({ tab });
        }}
        workspaces={libraryData.workspaces}
        {...dialogState.libraryHandlers}
        onRenameWorkspace={async (name) => {
          await libraryData.renameWorkspace({
            workspaceId: toWorkspaceId(workspaceId),
            name,
          });
        }}
        onUpdateWorkspaceEmoji={async (emoji) => {
          await libraryData.updateWorkspaceEmoji({
            workspaceId: toWorkspaceId(workspaceId),
            emoji,
          });
        }}
        getArtifactSelected={getArtifactSelected}
        onToggleArtifactContext={onToggleArtifactContext}
        onSetArtifactContextSelection={onSetArtifactContextSelection}
        contextCount={contextCount}
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
            uploadFile: ({ file }) =>
              libraryData.uploadArtifact.mutateAsync({
                file,
                folderId: folderId === "root" ? undefined : folderId,
              }),
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
        variant={variant}
        renderDialogs={(activeFolderId, activeFolderName, onUploadFiles) => (
          <WorkspaceLibraryDialogsStack
            workspaceId={workspaceId}
            activeFolderId={activeFolderId}
            activeFolderName={activeFolderName}
            mutations={libraryMutations}
            dialogState={dialogState}
            onAfterArchive={onAfterArchive}
            onUploadFiles={onUploadFiles}
          />
        )}
      />
    </>
  );
}

function dedupeArtifactTypes(types: WorkspaceArtifactType[]) {
  return workspaceArtifactTypes.filter((type) => types.includes(type));
}

"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  FileTextIcon,
  FolderIcon,
  LinkIcon,
  UploadIcon,
} from "@aqsha/ui/icons";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { useWorkspaceFolderNav } from "../hooks/use-workspace-folder-nav";
import {
  applyWorkspaceArtifactControls,
  getFolderView,
  getMoveTargetOptions,
  getUploadTargetFolderId,
  getWorkspaceMoveTargetOptions,
  groupArtifactsByFolder,
  type WorkspaceArtifactSort,
  type WorkspaceArtifactType,
  type WorkspaceArtifact,
  type WorkspaceFolder,
} from "../utils/workspace-library-model";
import { panelBodyPaddingClass } from "@/lib/panel-surface";
import {
  WORKSPACE_UPLOAD_ACCEPT,
  type WorkspaceUploadProgressEvent,
  type WorkspaceUploadResult,
} from "../utils/workspace-file-upload";
import { WorkspaceBoardToolbar } from "./workspace-board-toolbar";
import { WorkspaceLibraryControls } from "./workspace-library-controls";
import { WorkspaceLibraryEmpty } from "./workspace-library-empty";
import { WorkspaceLibraryGrid } from "./workspace-library-grid";
import { useWorkspaceUploadToast } from "./workspace-upload-toast";

export function WorkspaceLibraryBoard({
  workspaceName,
  workspaceEmoji,
  workspaceId,
  titleSlot,
  folders,
  artifacts,
  searchQuery,
  selectedTypes,
  sort,
  onSearchQueryChange,
  onToggleType,
  onSortChange,
  workspaces,
  getArtifactSelected,
  onToggleArtifactContext,
  onSetArtifactContextSelection,
  onOpenArtifact,
  onRenameFolder,
  onDeleteFolder,
  onRenameArtifact,
  onDeleteArtifact,
  onMoveArtifact,
  onMoveArtifactToWorkspace,
  onMoveFolderToWorkspace,
  onUploadFiles,
  onCreateFolder,
  onCreateDocument,
  onCreateUrl,
  onRenameWorkspace,
  onUpdateWorkspaceEmoji,
  onArchiveWorkspace,
  chatPanelOpen,
  onToggleChatPanel,
  onClosePanel,
  showLeftSidebarTrigger,
  onToggleLeftSidebar,
  renderDialogs,
  showCreateActions,
  showWorkspaceSettings,
}: {
  workspaceName: string;
  workspaceEmoji?: string;
  workspaceId: string;
  titleSlot?: ReactNode;
  folders: WorkspaceFolder[];
  artifacts: WorkspaceArtifact[];
  searchQuery: string;
  selectedTypes: WorkspaceArtifactType[];
  sort: WorkspaceArtifactSort;
  onSearchQueryChange: (query: string) => void;
  onToggleType: (type: WorkspaceArtifactType) => void;
  onSortChange: (sort: WorkspaceArtifactSort) => void;
  workspaces: Array<{ _id: string; name: string }>;
  getArtifactSelected: (artifactId: string) => boolean;
  onToggleArtifactContext: (artifactId: string) => void;
  onSetArtifactContextSelection: (artifactIds: string[]) => void;
  onOpenArtifact: (artifactId: string) => void;
  onRenameFolder: (folder: WorkspaceFolder) => void;
  onDeleteFolder: (folder: WorkspaceFolder) => void;
  onRenameArtifact: (artifact: WorkspaceArtifact) => void;
  onDeleteArtifact: (artifact: WorkspaceArtifact) => void;
  onMoveArtifact: (artifactId: string, target: string) => Promise<void>;
  onMoveArtifactToWorkspace: (
    artifactId: string,
    targetWorkspaceId: string,
  ) => Promise<void>;
  onMoveFolderToWorkspace: (
    folderId: string,
    targetWorkspaceId: string,
  ) => Promise<void>;
  onUploadFiles: (
    files: File[],
    folderId: "root" | string,
    options?: {
      onFileChange?: (event: WorkspaceUploadProgressEvent) => void;
    },
  ) => Promise<WorkspaceUploadResult[]>;
  onCreateFolder: () => void;
  onCreateDocument: () => void;
  onCreateUrl: () => void;
  onRenameWorkspace: (name: string) => Promise<unknown>;
  onUpdateWorkspaceEmoji: (emoji: string) => Promise<unknown>;
  onArchiveWorkspace: () => void;
  chatPanelOpen?: boolean;
  onToggleChatPanel?: () => void;
  onClosePanel?: () => void;
  showLeftSidebarTrigger?: boolean;
  onToggleLeftSidebar?: () => void;
  renderDialogs?: (activeFolderId: "root" | string) => ReactNode;
  showCreateActions?: boolean;
  showWorkspaceSettings?: boolean;
}) {
  const filteredArtifacts = applyWorkspaceArtifactControls({
    artifacts,
    query: searchQuery,
    types: selectedTypes,
    sort,
  });
  const groups = groupArtifactsByFolder({
    folders,
    artifacts: filteredArtifacts,
    sort,
  });
  const { activeFolderId, openFolder, navigateTo } =
    useWorkspaceFolderNav(groups);

  const folderView = getFolderView({ groups, activeFolderId });
  const moveTargets = getMoveTargetOptions(folders);
  const workspaceMoveTargets = getWorkspaceMoveTargetOptions(
    workspaces,
    workspaceId,
  ).map((target) => ({
    _id: target.value,
    name: target.label,
  }));
  const [dragArtifactId, setDragArtifactId] = useState<string | null>(null);
  const [isUploadDragOver, setIsUploadDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadToast = useWorkspaceUploadToast({ onUploadFiles });

  const isEmpty =
    folderView.folders.length === 0 && folderView.artifacts.length === 0;
  const isFilteredEmpty =
    isEmpty &&
    (searchQuery.trim().length > 0 || selectedTypes.length > 0) &&
    artifacts.length > 0;
  const libraryControls = (
    <WorkspaceLibraryControls
      query={searchQuery}
      selectedTypes={selectedTypes}
      sort={sort}
      className="w-full sm:w-auto sm:justify-end"
      onQueryChange={onSearchQueryChange}
      onToggleType={onToggleType}
      onSortChange={onSortChange}
    />
  );

  const handleDropOnFolder = async (folderId: string) => {
    if (!dragArtifactId) return;
    await onMoveArtifact(dragArtifactId, folderId);
    setDragArtifactId(null);
  };

  const uploadToActiveFolder = async (fileList: FileList | File[]) => {
    const files = [...fileList];
    if (files.length === 0) return;
    uploadToast.enqueue(
      files,
      getUploadTargetFolderId(folderView.activeFolderId) ?? "root",
    );
    setIsUploadDragOver(false);
  };

  const openUploadPicker = () => fileInputRef.current?.click();

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        <input
          ref={fileInputRef}
          type="file"
          aria-label="Pilih file untuk workspace"
          multiple
          accept={WORKSPACE_UPLOAD_ACCEPT}
          className="sr-only"
          onChange={(event) => {
            if (event.currentTarget.files) {
              void uploadToActiveFolder(event.currentTarget.files);
            }
            event.currentTarget.value = "";
          }}
        />
        <WorkspaceBoardToolbar
          workspaceName={workspaceName}
          workspaceEmoji={workspaceEmoji}
          titleSlot={titleSlot}
          breadcrumb={folderView.breadcrumb}
          onNavigate={navigateTo}
          onCreateFolder={onCreateFolder}
          onCreateDocument={onCreateDocument}
          onCreateUrl={onCreateUrl}
          onRenameWorkspace={onRenameWorkspace}
          onUpdateWorkspaceEmoji={onUpdateWorkspaceEmoji}
          onArchiveWorkspace={onArchiveWorkspace}
          onToggleChat={onToggleChatPanel}
          chatOpen={chatPanelOpen}
          onClosePanel={onClosePanel}
          showLeftSidebarTrigger={showLeftSidebarTrigger}
          onToggleLeftSidebar={onToggleLeftSidebar}
          showCreateActions={showCreateActions}
          showWorkspaceSettings={showWorkspaceSettings}
        />
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              className={cn(
                "relative min-h-0 flex-1 overflow-y-auto bg-background",
                panelBodyPaddingClass,
                isUploadDragOver &&
                  "bg-muted/25 ring-2 ring-inset ring-primary/30",
              )}
              onDragEnter={(event) => {
                if (event.dataTransfer.types.includes("Files")) {
                  event.preventDefault();
                  setIsUploadDragOver(true);
                }
              }}
              onDragOver={(event) => {
                if (event.dataTransfer.types.includes("Files")) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "copy";
                }
              }}
              onDragLeave={(event) => {
                if (
                  !event.currentTarget.contains(
                    event.relatedTarget as Node | null,
                  )
                ) {
                  setIsUploadDragOver(false);
                }
              }}
              onDrop={(event) => {
                if (!event.dataTransfer.types.includes("Files")) return;
                event.preventDefault();
                void uploadToActiveFolder(event.dataTransfer.files);
              }}
            >
              {isEmpty ? (
                isFilteredEmpty ? (
                  <div className="flex flex-col gap-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 flex-1 items-center gap-5">
                        <h2 className="shrink-0 text-[15px] font-semibold leading-none text-foreground">
                          All items (0)
                        </h2>
                        <div className="h-px min-w-0 flex-1 bg-border/70" />
                      </div>
                      <div className="flex shrink-0 justify-start sm:justify-end">
                        {libraryControls}
                      </div>
                    </div>
                    <WorkspaceLibraryEmpty
                      variant={
                        folderView.activeFolderId === "root" ? "root" : "folder"
                      }
                      title="Tidak ada dokumen yang cocok"
                      description="Ubah filter tipe dokumen atau reset filter untuk melihat item lain."
                      showActions={false}
                      onCreateFolder={onCreateFolder}
                      onCreateDocument={onCreateDocument}
                      onCreateUrl={onCreateUrl}
                    />
                  </div>
                ) : (
                  <WorkspaceLibraryEmpty
                    variant={
                      folderView.activeFolderId === "root" ? "root" : "folder"
                    }
                    onCreateFolder={onCreateFolder}
                    onCreateDocument={onCreateDocument}
                    onCreateUrl={onCreateUrl}
                  />
                )
              ) : (
                <WorkspaceLibraryGrid
                  folders={folderView.folders}
                  artifacts={folderView.artifacts}
                  workspaceId={workspaceId}
                  workspaces={workspaceMoveTargets}
                  moveTargets={moveTargets}
                  dragArtifactId={dragArtifactId}
                  getArtifactSelected={getArtifactSelected}
                  onToggleArtifactContext={onToggleArtifactContext}
                  onSetArtifactContextSelection={onSetArtifactContextSelection}
                  onOpenFolder={openFolder}
                  onOpenArtifact={onOpenArtifact}
                  onRenameFolder={onRenameFolder}
                  onDeleteFolder={onDeleteFolder}
                  onMoveFolderToWorkspace={onMoveFolderToWorkspace}
                  onRenameArtifact={onRenameArtifact}
                  onDeleteArtifact={onDeleteArtifact}
                  onMoveArtifact={onMoveArtifact}
                  onMoveArtifactToWorkspace={onMoveArtifactToWorkspace}
                  onDragArtifactStart={setDragArtifactId}
                  onDragArtifactEnd={() => setDragArtifactId(null)}
                  onDropArtifactOnFolder={(folderId) =>
                    void handleDropOnFolder(folderId)
                  }
                  controls={libraryControls}
                />
              )}
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-48">
            <ContextMenuItem onSelect={openUploadPicker}>
              <UploadIcon className="size-4" />
              Upload file
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={onCreateFolder}>
              <FolderIcon className="size-4" />
              Folder baru
            </ContextMenuItem>
            <ContextMenuItem onSelect={onCreateDocument}>
              <FileTextIcon className="size-4" />
              Dokumen baru
            </ContextMenuItem>
            <ContextMenuItem onSelect={onCreateUrl}>
              <LinkIcon className="size-4" />
              Simpan URL
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </div>
      {renderDialogs?.(activeFolderId)}
    </>
  );
}

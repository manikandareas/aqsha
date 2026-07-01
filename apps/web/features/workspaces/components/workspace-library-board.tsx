"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  FileTextIcon,
  FolderIcon,
  LinkIcon,
  NotebookIcon,
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
import { useFileDropzone } from "../hooks/use-file-dropzone";
import { useWorkspaceFolderNav } from "../hooks/use-workspace-folder-nav";
import {
  applyWorkspaceArtifactControls,
  getFolderView,
  getMoveTargetOptions,
  getUploadTargetFolderId,
  getWorkspaceMoveTargetOptions,
  groupArtifactsByFolder,
  partitionArtifactsByCategory,
  type WorkspaceArtifactSort,
  type WorkspaceArtifactType,
  type WorkspaceArtifact,
  type WorkspaceFolder,
} from "../utils/workspace-library-model";
import type { WorkspaceLibraryTab } from "./workspace-library-surface";
import { SidePanelFrame } from "@/components/layout/side-panel-frame";
import { panelBodyColumnClass, panelBodyPaddingClass } from "@/lib/panel-surface";
import {
  WORKSPACE_UPLOAD_ACCEPT,
  type WorkspaceUploadProgressEvent,
  type WorkspaceUploadResult,
} from "../utils/workspace-file-upload";
import { WorkspaceArtifactTimeline } from "./workspace-artifact-timeline";
import { WorkspaceBoardToolbar } from "./workspace-board-toolbar";
import { WorkspaceLibraryControls } from "./workspace-library-controls";
import { WorkspaceLibraryEmpty } from "./workspace-library-empty";
import { WorkspaceLibraryFootnote } from "./workspace-library-footnote";
import { WorkspaceLibraryGrid } from "./workspace-library-grid";
import { WorkspaceLibraryTabs } from "./workspace-library-tabs";
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
  activeTab,
  onTabChange,
  workspaces,
  getArtifactSelected,
  onToggleArtifactContext,
  onSetArtifactContextSelection,
  contextCount,
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
  variant = "page",
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
  activeTab: WorkspaceLibraryTab;
  onTabChange: (tab: WorkspaceLibraryTab) => void;
  workspaces: Array<{ _id: string; name: string }>;
  getArtifactSelected: (artifactId: string) => boolean;
  onToggleArtifactContext: (artifactId: string) => void;
  onSetArtifactContextSelection: (artifactIds: string[]) => void;
  contextCount?: number;
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
  renderDialogs?: (
    activeFolderId: "root" | string,
    activeFolderName: string,
    onUploadFiles: (files: File[]) => void,
  ) => ReactNode;
  showCreateActions?: boolean;
  showWorkspaceSettings?: boolean;
  /**
   * `"page"` (default) renders the board as a full-bleed column (toolbar inside).
   * `"panel"` routes through `SidePanelFrame` so the toolbar floats OUTSIDE the card.
   */
  variant?: "page" | "panel";
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadToast = useWorkspaceUploadToast({ onUploadFiles });

  const isPustaka = activeTab === "pustaka";
  const hasFilter =
    searchQuery.trim().length > 0 || selectedTypes.length > 0;
  // Hitungan untuk badge tab = total per kategori se-workspace (mengikuti filter aktif).
  const { library: allLibrary, output: allOutput } =
    partitionArtifactsByCategory(filteredArtifacts);
  // Pustaka tab = folder + artifak library di folder aktif (folder-scoped).
  const folderLibrary = partitionArtifactsByCategory(folderView.artifacts).library;
  const rawLibraryCount = partitionArtifactsByCategory(artifacts).library.length;

  const pustakaEmpty =
    folderView.folders.length === 0 && folderLibrary.length === 0;
  const pustakaFilteredEmpty =
    pustakaEmpty && hasFilter && rawLibraryCount > 0;
  const artifactFilteredEmpty = allOutput.length === 0 && hasFilter;
  // Footnote panduan hanya relevan saat ada item untuk di-gesture; di state
  // kosong ia disembunyikan agar layar kosong tetap bersih.
  const showFootnote = isPustaka ? !pustakaEmpty : allOutput.length > 0;

  const canCreate = (showCreateActions ?? true) && isPustaka;
  const libraryControls = (
    <WorkspaceLibraryControls
      query={searchQuery}
      selectedTypes={selectedTypes}
      sort={sort}
      showSort={isPustaka}
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
  };

  const { isDragOver: isUploadDragOver, dropzoneProps } = useFileDropzone(
    (files) => void uploadToActiveFolder(files),
  );

  const openUploadPicker = () => fileInputRef.current?.click();

  const toolbar = (
    <WorkspaceBoardToolbar
      workspaceName={workspaceName}
      workspaceEmoji={workspaceEmoji}
      titleSlot={titleSlot}
      // Breadcrumb folder hanya relevan di tab Pustaka.
      breadcrumb={isPustaka ? folderView.breadcrumb : folderView.breadcrumb.slice(0, 1)}
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
      showCreateActions={canCreate}
      showWorkspaceSettings={showWorkspaceSettings}
    />
  );

  // Scrollable board body (tabs + grid/timeline + footnote). The hidden upload input
  // rides along here; in panel mode this tucks into the floating card while `toolbar`
  // hoists out as the flush header — in page mode both sit in the same column.
  const body = (
    <>
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
        <WorkspaceLibraryTabs
          activeTab={activeTab}
          onTabChange={onTabChange}
          libraryCount={allLibrary.length}
          artifactCount={allOutput.length}
          controls={libraryControls}
        />
        {isPustaka ? (
          <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              {...dropzoneProps}
              className={cn(
                "@container relative min-h-0 flex-1 overflow-y-auto bg-background",
                panelBodyPaddingClass,
                "pt-6",
                isUploadDragOver &&
                  "bg-muted/25 ring-2 ring-inset ring-primary/30",
              )}
            >
              {pustakaEmpty ? (
                pustakaFilteredEmpty ? (
                  <WorkspaceLibraryEmpty
                    variant={
                      folderView.activeFolderId === "root" ? "root" : "folder"
                    }
                    title="Tidak ada dokumen yang cocok"
                    description="Ubah filter tipe dokumen atau reset filter untuk melihat item lain."
                    showActions={false}
                    showSamples={false}
                    onCreateFolder={onCreateFolder}
                    onCreateDocument={onCreateDocument}
                    onCreateUrl={onCreateUrl}
                  />
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
        ) : (
          <div
            className={cn(
              "@container relative min-h-0 flex-1 overflow-y-auto bg-background",
              panelBodyPaddingClass,
              "pt-6",
            )}
          >
            {allOutput.length === 0 ? (
              <WorkspaceLibraryEmpty
                variant="root"
                icon={NotebookIcon}
                title={
                  artifactFilteredEmpty
                    ? "Tidak ada artifact yang cocok"
                    : "Hasil kerja agent muncul di sini"
                }
                description={
                  artifactFilteredEmpty
                    ? "Ubah filter atau kata kunci untuk melihat artifact lain."
                    : "Minta agent membuat laporan, ringkasan, atau visualisasi lewat chat — semuanya tersimpan otomatis di sini."
                }
                showActions={false}
                showSamples={!artifactFilteredEmpty}
              />
            ) : (
              <WorkspaceArtifactTimeline
                artifacts={allOutput}
                workspaceId={workspaceId}
                workspaces={workspaceMoveTargets}
                moveTargets={moveTargets}
                getArtifactSelected={getArtifactSelected}
                onToggleArtifactContext={onToggleArtifactContext}
                onOpenArtifact={onOpenArtifact}
                onRenameArtifact={onRenameArtifact}
                onDeleteArtifact={onDeleteArtifact}
                onMoveArtifact={onMoveArtifact}
                onMoveArtifactToWorkspace={onMoveArtifactToWorkspace}
              />
            )}
          </div>
        )}
        {showFootnote ? (
          <WorkspaceLibraryFootnote
            activeTab={activeTab}
            contextCount={contextCount}
            onClearContext={() => onSetArtifactContextSelection([])}
          />
        ) : null}
    </>
  );

  const dialogs = renderDialogs?.(
    activeFolderId,
    folderView.activeFolderId === "root"
      ? ""
      : (folderView.breadcrumb.at(-1)?.label ?? ""),
    uploadToActiveFolder,
  );

  // Panel: toolbar floats OUTSIDE the card as the flush header; body tucks into the card.
  // `SidePanelFrame` already wraps its children in the body column, so `body` goes in raw.
  if (variant === "panel") {
    return (
      <>
        <SidePanelFrame header={toolbar}>{body}</SidePanelFrame>
        {dialogs}
      </>
    );
  }

  // Page: full-bleed column with the toolbar inside it (unchanged from the original).
  return (
    <>
      <div className={panelBodyColumnClass}>
        {toolbar}
        {body}
      </div>
      {dialogs}
    </>
  );
}

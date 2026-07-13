"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier,
} from "@dnd-kit/core";
import {
  FileTextIcon,
  FolderIcon,
  LinkIcon,
  UploadIcon,
} from "@aqsha/ui/icons";
import { LibraryDragOverlayCard } from "@/components/library-drag-overlay-card";
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
  type WorkspaceArtifactSort,
  type WorkspaceArtifactType,
  type WorkspaceArtifact,
  type WorkspaceFolder,
} from "../utils/workspace-library-model";
import {
  panelBodyColumnClass,
  panelBodyPaddingClass,
  panelCardToolbarClass,
} from "@/lib/panel-surface";
import {
  WORKSPACE_UPLOAD_ACCEPT,
  type WorkspaceUploadProgressEvent,
  type WorkspaceUploadResult,
} from "../utils/workspace-file-upload";
import { WorkspaceBoardToolbar } from "./workspace-board-toolbar";
import { WorkspaceLibraryControls } from "./workspace-library-controls";
import { WorkspaceLibraryEmpty } from "./workspace-library-empty";
import { WorkspaceLibraryFootnote } from "./workspace-library-footnote";
import { WorkspaceLibraryGrid } from "./workspace-library-grid";
import { useWorkspaceUploadToast } from "./workspace-upload-toast";

// Keep the lifted mini-card centered on the pointer. dnd-kit sizes the drag
// overlay wrapper to the grabbed card, so without this the compact chip would
// float far from the cursor (anchored to the card's corner). We recenter the
// wrapper on the pointer; a flex wrapper then centers the chip within it.
const snapCenterToCursor: Modifier = ({
  activatorEvent,
  draggingNodeRect,
  transform,
}) => {
  if (!draggingNodeRect || !activatorEvent) return transform;
  const pointer = activatorEvent as { clientX?: number; clientY?: number };
  if (typeof pointer.clientX !== "number" || typeof pointer.clientY !== "number") {
    return transform;
  }
  const offsetX = pointer.clientX - draggingNodeRect.left;
  const offsetY = pointer.clientY - draggingNodeRect.top;
  return {
    ...transform,
    x: transform.x + offsetX - draggingNodeRect.width / 2,
    y: transform.y + offsetY - draggingNodeRect.height / 2,
  };
};

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
  contextCount,
  onOpenArtifact,
  onRenameFolder,
  onDeleteFolder,
  onRenameArtifact,
  onDeleteArtifact,
  onAddToCitations,
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
  onAddToCitations?: (artifact: WorkspaceArtifact) => void;
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
   * `"panel"` renders IN-CARD content for the side panel host (the flush tabs header +
   * card come from the thread shell's `SidePanelFrame`): the toolbar becomes the card's
   * top bar, the body scrolls below it.
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
  // Ids in the active drag. Length > 1 when a multi-selection is dragged; the
  // first entry is the card actually grabbed (drives the overlay's front face).
  const [dragArtifactIds, setDragArtifactIds] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadToast = useWorkspaceUploadToast({ onUploadFiles });

  const hasFilter =
    searchQuery.trim().length > 0 || selectedTypes.length > 0;
  // Unified board: folder + semua artifact (pustaka user + output agent) berbagi
  // satu grid folder-scoped. Kartu artifact dibedakan lewat badge/aksen, bukan tab.
  const boardEmpty =
    folderView.folders.length === 0 && folderView.artifacts.length === 0;
  const rawArtifactCount = artifacts.filter(
    (artifact) => artifact.status !== "deleted",
  ).length;
  const boardFilteredEmpty = boardEmpty && hasFilter && rawArtifactCount > 0;
  // Label for the empty-state category pill: workspace name at root, otherwise
  // the active folder's name. The workspace emoji only fronts the root pill.
  const isRootFolder = folderView.activeFolderId === "root";
  const activeFolderName = isRootFolder
    ? workspaceName
    : (folderView.breadcrumb.at(-1)?.label ?? "Folder");
  const activeBadgeEmoji = isRootFolder ? workspaceEmoji : undefined;
  // Footnote panduan hanya relevan saat ada item untuk di-gesture; di state
  // kosong ia disembunyikan agar layar kosong tetap bersih.
  const showFootnote = !boardEmpty;

  const canCreate = showCreateActions ?? true;
  const libraryControls = (
    <WorkspaceLibraryControls
      query={searchQuery}
      selectedTypes={selectedTypes}
      sort={sort}
      onQueryChange={onSearchQueryChange}
      onToggleType={onToggleType}
      onSortChange={onSortChange}
    />
  );

  // dnd-kit: activate a drag only after the pointer travels a few px so plain
  // clicks (select / open on the card) still pass through untouched.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );
  // Resolve the dragged ids to artifacts (grabbed one first) so the overlay can
  // fan their filenames into a Finder-style cascade.
  const dragArtifacts = dragArtifactIds.flatMap((id) => {
    const artifact = folderView.artifacts.find((item) => item._id === id);
    return artifact ? [artifact] : [];
  });

  const handleDragStart = (event: DragStartEvent) => {
    const grabbedId = String(event.active.id);
    const selectedIds = folderView.artifacts
      .filter((artifact) => getArtifactSelected(artifact._id))
      .map((artifact) => artifact._id);
    // Grab a card that's part of a multi-selection → drag the whole selection;
    // grab anything else → drag just it (leaving any selection untouched). The
    // grabbed id stays first so the overlay shows the card you actually held.
    const dragIds =
      selectedIds.length > 1 && selectedIds.includes(grabbedId)
        ? [grabbedId, ...selectedIds.filter((id) => id !== grabbedId)]
        : [grabbedId];
    setDragArtifactIds(dragIds);
  };
  const handleDragEnd = (event: DragEndEvent) => {
    // The only droppables are folder tiles, so a non-null `over` is a folder.
    const folderId = event.over?.id;
    if (folderId != null) {
      for (const artifactId of dragArtifactIds) {
        void onMoveArtifact(artifactId, String(folderId));
      }
    }
    setDragArtifactIds([]);
  };
  const handleDragCancel = () => setDragArtifactIds([]);

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
      barClassName={variant === "panel" ? panelCardToolbarClass : undefined}
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
      controls={libraryControls}
      onToggleChat={onToggleChatPanel}
      chatOpen={chatPanelOpen}
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
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              {...dropzoneProps}
              className={cn(
                "@container relative min-h-0 flex-1 overflow-y-auto bg-background",
                panelBodyPaddingClass,
                "pt-5",
                isUploadDragOver &&
                  "bg-muted/25 ring-2 ring-inset ring-primary/30",
              )}
            >
              {boardEmpty ? (
                boardFilteredEmpty ? (
                  <WorkspaceLibraryEmpty
                    variant={isRootFolder ? "root" : "folder"}
                    badgeLabel={activeFolderName}
                    badgeEmoji={activeBadgeEmoji}
                    title="Tidak ada dokumen yang cocok"
                    description="Ubah filter tipe dokumen atau kata kunci untuk melihat item lain."
                    showActions={false}
                  />
                ) : (
                  <WorkspaceLibraryEmpty
                    variant={isRootFolder ? "root" : "folder"}
                    badgeLabel={activeFolderName}
                    badgeEmoji={activeBadgeEmoji}
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
                  draggingArtifactIds={dragArtifactIds}
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
                  onAddToCitations={onAddToCitations}
                  onMoveArtifact={onMoveArtifact}
                  onMoveArtifactToWorkspace={onMoveArtifactToWorkspace}
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
        {showFootnote ? (
          <WorkspaceLibraryFootnote
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

  // Panel = in-card content (the host's `SidePanelFrame` provides the card column, so
  // toolbar + body go in raw); page keeps the toolbar inside a full-bleed column.
  const boardShell =
    variant === "panel" ? (
      <>
        {toolbar}
        {body}
      </>
    ) : (
      <div className={panelBodyColumnClass}>
        {toolbar}
        {body}
      </div>
    );

  // One `DndContext` drives both variants: it owns the drag lifecycle and the
  // `DragOverlay` renders the lifted mini-card that follows the pointer.
  // `dropAnimation={null}` skips the fly-back tween — on a successful move the
  // source card leaves the grid, so there is nothing to animate back to. The
  // `snapCenterToCursor` modifier + flex wrapper keep the compact chip pinned
  // to the pointer despite the overlay wrapper being sized to the grabbed card.
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {boardShell}
      <DragOverlay dropAnimation={null} modifiers={[snapCenterToCursor]}>
        {dragArtifacts.length > 0 ? (
          <div className="pointer-events-none flex size-full items-center justify-center">
            <LibraryDragOverlayCard
              titles={dragArtifacts.map((artifact) => artifact.title)}
            />
          </div>
        ) : null}
      </DragOverlay>
      {dialogs}
    </DndContext>
  );
}

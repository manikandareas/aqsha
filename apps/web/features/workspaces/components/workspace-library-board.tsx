"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FileTextIcon, FolderIcon, LinkIcon, UploadIcon } from "lucide-react";
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
  getFolderView,
  getMoveTargetOptions,
  getUploadTargetFolderId,
  getWorkspaceMoveTargetOptions,
  groupArtifactsByFolder,
  type WorkspaceArtifact,
  type WorkspaceFolder,
} from "../utils/workspace-library-model";
import { panelBodyPaddingClass } from "@/lib/panel-surface";
import {
  type WorkspaceUploadProgressEvent,
  type WorkspaceUploadResult,
} from "../utils/workspace-file-upload";
import { WorkspaceBoardToolbar } from "./workspace-board-toolbar";
import { WorkspaceLibraryEmpty } from "./workspace-library-empty";
import { WorkspaceLibraryGrid } from "./workspace-library-grid";
import { useWorkspaceUploadToast } from "./workspace-upload-toast";

export function WorkspaceLibraryBoard({
  workspaceName,
  workspaceId,
  titleSlot,
  folders,
  artifacts,
  workspaces,
  isArtifactSelected,
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
  onArchiveWorkspace,
  chatPanelOpen,
  onToggleChatPanel,
  onClosePanel,
  showLeftSidebarTrigger,
  onToggleLeftSidebar,
  onActiveFolderChange,
  showCreateActions,
  showWorkspaceSettings,
}: {
  workspaceName: string;
  workspaceId: string;
  titleSlot?: ReactNode;
  folders: WorkspaceFolder[];
  artifacts: WorkspaceArtifact[];
  workspaces: Array<{ _id: string; name: string }>;
  isArtifactSelected: (artifactId: string) => boolean;
  onToggleArtifactContext: (artifactId: string) => void;
  onSetArtifactContextSelection: (artifactIds: string[]) => void;
  onOpenArtifact: (artifactId: string) => void;
  onRenameFolder: (folder: WorkspaceFolder) => void;
  onDeleteFolder: (folder: WorkspaceFolder) => void;
  onRenameArtifact: (artifact: WorkspaceArtifact) => void;
  onDeleteArtifact: (artifact: WorkspaceArtifact) => void;
  onMoveArtifact: (artifactId: string, target: string) => Promise<void>;
  onMoveArtifactToWorkspace: (artifactId: string, targetWorkspaceId: string) => Promise<void>;
  onMoveFolderToWorkspace: (folderId: string, targetWorkspaceId: string) => Promise<void>;
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
  onRenameWorkspace: () => void;
  onArchiveWorkspace: () => void;
  chatPanelOpen?: boolean;
  onToggleChatPanel?: () => void;
  onClosePanel?: () => void;
  showLeftSidebarTrigger?: boolean;
  onToggleLeftSidebar?: () => void;
  onActiveFolderChange?: (folderId: "root" | string) => void;
  showCreateActions?: boolean;
  showWorkspaceSettings?: boolean;
}) {
  const groups = useMemo(
    () => groupArtifactsByFolder({ folders, artifacts }),
    [artifacts, folders],
  );
  const { activeFolderId, openFolder, navigateTo } = useWorkspaceFolderNav(groups);

  useEffect(() => {
    onActiveFolderChange?.(activeFolderId);
  }, [activeFolderId, onActiveFolderChange]);

  const folderView = useMemo(
    () => getFolderView({ groups, activeFolderId }),
    [activeFolderId, groups],
  );
  const moveTargets = useMemo(() => getMoveTargetOptions(folders), [folders]);
  const workspaceMoveTargets = useMemo(
    () =>
      getWorkspaceMoveTargetOptions(workspaces, workspaceId).map((target) => ({
        _id: target.value,
        name: target.label,
      })),
    [workspaceId, workspaces],
  );
  const [dragArtifactId, setDragArtifactId] = useState<string | null>(null);
  const [isUploadDragOver, setIsUploadDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadToast = useWorkspaceUploadToast({ onUploadFiles });

  const isEmpty =
    folderView.folders.length === 0 && folderView.artifacts.length === 0;

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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.txt,.md,.markdown,.csv,.json,.html,.htm,.svg,.mmd,.mermaid,.js,.jsx,.ts,.tsx,.css,.py,.java,.go,.rs,.sql,.sh,.yml,.yaml,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/csv,text/html,application/json,image/svg+xml,text/javascript,application/javascript,text/css,text/yaml,application/x-yaml"
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
        titleSlot={titleSlot}
        breadcrumb={folderView.breadcrumb}
        onNavigate={navigateTo}
        onCreateFolder={onCreateFolder}
        onCreateDocument={onCreateDocument}
        onCreateUrl={onCreateUrl}
        onRenameWorkspace={onRenameWorkspace}
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
              isUploadDragOver && "bg-muted/25 ring-2 ring-inset ring-primary/30",
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
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
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
              <WorkspaceLibraryEmpty
                variant={folderView.activeFolderId === "root" ? "root" : "folder"}
                onCreateFolder={onCreateFolder}
                onCreateDocument={onCreateDocument}
                onCreateUrl={onCreateUrl}
              />
            ) : (
              <WorkspaceLibraryGrid
                folders={folderView.folders}
                artifacts={folderView.artifacts}
                workspaceId={workspaceId}
                workspaces={workspaceMoveTargets}
                moveTargets={moveTargets}
                dragArtifactId={dragArtifactId}
                isArtifactSelected={isArtifactSelected}
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
                onDropArtifactOnFolder={(folderId) => void handleDropOnFolder(folderId)}
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
  );
}

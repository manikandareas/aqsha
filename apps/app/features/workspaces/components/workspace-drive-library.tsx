"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useWorkspaceFolderNav } from "../hooks/use-workspace-folder-nav";
import {
  getFolderView,
  getMoveTargetOptions,
  groupArtifactsByFolder,
  type WorkspaceArtifact,
  type WorkspaceFolder,
} from "../utils/workspace-library-model";
import { panelBodyPaddingClass } from "@/lib/panel-surface";
import { WorkspaceBoardToolbar } from "./workspace-board-toolbar";
import { WorkspaceDriveEmpty } from "./workspace-drive-empty";
import { WorkspaceDriveGrid } from "./workspace-drive-grid";

export function WorkspaceDriveLibrary({
  workspaceName,
  titleSlot,
  folders,
  artifacts,
  isArtifactSelected,
  onToggleArtifactContext,
  onOpenArtifact,
  onRenameFolder,
  onDeleteFolder,
  onRenameArtifact,
  onDeleteArtifact,
  onMoveArtifact,
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
  titleSlot?: ReactNode;
  folders: WorkspaceFolder[];
  artifacts: WorkspaceArtifact[];
  isArtifactSelected: (artifactId: string) => boolean;
  onToggleArtifactContext: (artifactId: string) => void;
  onOpenArtifact: (artifactId: string) => void;
  onRenameFolder: (folder: WorkspaceFolder) => void;
  onDeleteFolder: (folder: WorkspaceFolder) => void;
  onRenameArtifact: (artifact: WorkspaceArtifact) => void;
  onDeleteArtifact: (artifact: WorkspaceArtifact) => void;
  onMoveArtifact: (artifactId: string, target: string) => Promise<void>;
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
  const [dragArtifactId, setDragArtifactId] = useState<string | null>(null);

  const isEmpty =
    folderView.folders.length === 0 && folderView.artifacts.length === 0;

  const handleDropOnFolder = async (folderId: string) => {
    if (!dragArtifactId) return;
    await onMoveArtifact(dragArtifactId, folderId);
    setDragArtifactId(null);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
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
      <div className={cn("min-h-0 flex-1 overflow-y-auto bg-background", panelBodyPaddingClass)}>
        {isEmpty ? (
          <WorkspaceDriveEmpty
              variant={folderView.activeFolderId === "root" ? "root" : "folder"}
              onCreateFolder={onCreateFolder}
              onCreateDocument={onCreateDocument}
              onCreateUrl={onCreateUrl}
            />
        ) : (
          <WorkspaceDriveGrid
            folders={folderView.folders}
            artifacts={folderView.artifacts}
            moveTargets={moveTargets}
            dragArtifactId={dragArtifactId}
            isArtifactSelected={isArtifactSelected}
            onToggleArtifactContext={onToggleArtifactContext}
            onOpenFolder={openFolder}
            onOpenArtifact={onOpenArtifact}
            onRenameFolder={onRenameFolder}
            onDeleteFolder={onDeleteFolder}
            onRenameArtifact={onRenameArtifact}
            onDeleteArtifact={onDeleteArtifact}
            onMoveArtifact={onMoveArtifact}
            onDragArtifactStart={setDragArtifactId}
            onDragArtifactEnd={() => setDragArtifactId(null)}
            onDropArtifactOnFolder={(folderId) => void handleDropOnFolder(folderId)}
          />
        )}
      </div>
    </div>
  );
}

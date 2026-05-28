"use client";

import { FolderIcon } from "lucide-react";
import { DriveArtifactCard } from "@/components/drive-artifact-card";
import { useDriveItemClick } from "../hooks/use-drive-item-click";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { driveArtifactGridClass } from "@/lib/drive-grid";
import { cn } from "@/lib/utils";
import {
  ArtifactContextMenuContent,
  FolderContextMenuContent,
} from "./workspace-drive-context-menus";
import type {
  FolderSummary,
  MoveTargetOption,
  WorkspaceArtifact,
  WorkspaceFolder,
} from "../utils/workspace-library-model";

export function WorkspaceDriveGrid({
  folders,
  artifacts,
  workspaceId,
  workspaces,
  moveTargets,
  dragArtifactId,
  isArtifactSelected,
  onToggleArtifactContext,
  onOpenFolder,
  onOpenArtifact,
  onRenameFolder,
  onDeleteFolder,
  onMoveFolderToWorkspace,
  onRenameArtifact,
  onDeleteArtifact,
  onMoveArtifact,
  onMoveArtifactToWorkspace,
  onDragArtifactStart,
  onDragArtifactEnd,
  onDropArtifactOnFolder,
}: {
  folders: FolderSummary[];
  artifacts: WorkspaceArtifact[];
  workspaceId: string;
  workspaces: Array<{ _id: string; name: string }>;
  moveTargets: MoveTargetOption[];
  dragArtifactId: string | null;
  isArtifactSelected: (artifactId: string) => boolean;
  onToggleArtifactContext: (artifactId: string) => void;
  onOpenFolder: (folderId: string) => void;
  onOpenArtifact: (artifactId: string) => void;
  onRenameFolder: (folder: WorkspaceFolder) => void;
  onDeleteFolder: (folder: WorkspaceFolder) => void;
  onMoveFolderToWorkspace: (folderId: string, targetWorkspaceId: string) => Promise<void>;
  onRenameArtifact: (artifact: WorkspaceArtifact) => void;
  onDeleteArtifact: (artifact: WorkspaceArtifact) => void;
  onMoveArtifact: (artifactId: string, target: string) => Promise<void>;
  onMoveArtifactToWorkspace: (artifactId: string, targetWorkspaceId: string) => Promise<void>;
  onDragArtifactStart: (artifactId: string) => void;
  onDragArtifactEnd: () => void;
  onDropArtifactOnFolder: (folderId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      {folders.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {folders.map((folder) => (
            <FolderTile
              key={folder._id}
              folder={folder}
              isDropTarget={dragArtifactId !== null}
              onOpen={() => onOpenFolder(folder._id)}
              onRename={() => onRenameFolder(folder)}
              onDelete={() => onDeleteFolder(folder)}
              onMoveToWorkspace={(targetWorkspaceId) =>
                onMoveFolderToWorkspace(folder._id, targetWorkspaceId)
              }
              onDrop={() => onDropArtifactOnFolder(folder._id)}
              workspaces={workspaces}
            />
          ))}
        </div>
      ) : null}
      {artifacts.length > 0 ? (
        <div className={driveArtifactGridClass}>
          {artifacts.map((artifact) => (
            <ArtifactTile
              key={artifact._id}
              artifact={artifact}
              workspaceId={workspaceId}
              moveTargets={moveTargets}
              isDragging={dragArtifactId === artifact._id}
              isSelected={isArtifactSelected(artifact._id)}
              onSelect={() => onToggleArtifactContext(artifact._id)}
              onOpen={() => onOpenArtifact(artifact._id)}
              onRename={() => onRenameArtifact(artifact)}
              onDelete={() => onDeleteArtifact(artifact)}
              onMove={(target) => onMoveArtifact(artifact._id, target)}
              onMoveToWorkspace={(targetWorkspaceId) =>
                onMoveArtifactToWorkspace(artifact._id, targetWorkspaceId)
              }
              onDragStart={() => onDragArtifactStart(artifact._id)}
              onDragEnd={onDragArtifactEnd}
              workspaces={workspaces}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FolderTile({
  folder,
  isDropTarget,
  onOpen,
  onRename,
  onDelete,
  onMoveToWorkspace,
  onDrop,
  workspaces,
}: {
  folder: FolderSummary;
  isDropTarget: boolean;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  onMoveToWorkspace: (targetWorkspaceId: string) => void;
  onDrop: () => void;
  workspaces: Array<{ _id: string; name: string }>;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "group relative inline-flex max-w-full items-center rounded-lg transition-colors hover:bg-muted/50",
            isDropTarget && "ring-2 ring-primary/30",
          )}
          onDragOver={(event) => {
            if (!isDropTarget) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onDrop={(event) => {
            event.preventDefault();
            onDrop();
          }}
        >
          <button
            type="button"
            onDoubleClick={onOpen}
            className="inline-flex min-w-0 items-center gap-2.5 py-2 pl-2.5 pr-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label={`Folder ${folder.name}. Klik dua kali untuk membuka.`}
          >
            <FolderIcon
              className="size-5 shrink-0 fill-lemon text-lemon"
              strokeWidth={1.25}
            />
            <span className="truncate text-[13px] font-medium text-foreground">{folder.name}</span>
          </button>
        </div>
      </ContextMenuTrigger>
      <FolderContextMenuContent
        workspaces={workspaces}
        onOpen={onOpen}
        onRename={onRename}
        onDelete={onDelete}
        onMoveToWorkspace={onMoveToWorkspace}
      />
    </ContextMenu>
  );
}

function ArtifactTile({
  artifact,
  workspaceId,
  moveTargets,
  isDragging,
  isSelected,
  onSelect,
  onOpen,
  onRename,
  onDelete,
  onMove,
  onMoveToWorkspace,
  onDragStart,
  onDragEnd,
  workspaces,
}: {
  artifact: WorkspaceArtifact;
  workspaceId: string;
  moveTargets: MoveTargetOption[];
  workspaces: Array<{ _id: string; name: string }>;
  isDragging: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  onMove: (target: string) => void;
  onMoveToWorkspace: (targetWorkspaceId: string) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const { handleClick, handleDoubleClick } = useDriveItemClick({
    onSingleClick: onSelect,
    onDoubleClick: onOpen,
  });

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn("group relative", isDragging && "opacity-50")}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", artifact._id);
            onDragStart();
          }}
          onDragEnd={onDragEnd}
        >
          <DriveArtifactCard
            title={artifact.title}
            kind={artifact.kind}
            plainTextPreview={artifact.plainTextPreview}
            isSelected={isSelected}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
          />
        </div>
      </ContextMenuTrigger>
      <ArtifactContextMenuContent
        moveTargets={moveTargets}
        workspaces={workspaces}
        artifactHref={`/workspaces/${workspaceId}/artifacts/${artifact._id}`}
        isSelected={isSelected}
        onSelect={onSelect}
        onOpen={onOpen}
        onRename={onRename}
        onDelete={onDelete}
        onMove={onMove}
        onMoveToWorkspace={onMoveToWorkspace}
      />
    </ContextMenu>
  );
}

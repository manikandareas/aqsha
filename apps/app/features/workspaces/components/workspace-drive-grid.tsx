"use client";

import { FolderIcon, MoreHorizontalIcon, PenLineIcon, Trash2Icon } from "lucide-react";
import { DriveArtifactCard } from "@/components/drive-artifact-card";
import { useDriveItemClick } from "../hooks/use-drive-item-click";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { driveArtifactGridClass } from "@/lib/drive-grid";
import { cn } from "@/lib/utils";
import type {
  FolderSummary,
  MoveTargetOption,
  WorkspaceArtifact,
  WorkspaceFolder,
} from "../utils/workspace-library-model";

export function WorkspaceDriveGrid({
  folders,
  artifacts,
  moveTargets,
  dragArtifactId,
  isArtifactSelected,
  onToggleArtifactContext,
  onOpenFolder,
  onOpenArtifact,
  onRenameFolder,
  onDeleteFolder,
  onRenameArtifact,
  onDeleteArtifact,
  onMoveArtifact,
  onDragArtifactStart,
  onDragArtifactEnd,
  onDropArtifactOnFolder,
}: {
  folders: FolderSummary[];
  artifacts: WorkspaceArtifact[];
  moveTargets: MoveTargetOption[];
  dragArtifactId: string | null;
  isArtifactSelected: (artifactId: string) => boolean;
  onToggleArtifactContext: (artifactId: string) => void;
  onOpenFolder: (folderId: string) => void;
  onOpenArtifact: (artifactId: string) => void;
  onRenameFolder: (folder: WorkspaceFolder) => void;
  onDeleteFolder: (folder: WorkspaceFolder) => void;
  onRenameArtifact: (artifact: WorkspaceArtifact) => void;
  onDeleteArtifact: (artifact: WorkspaceArtifact) => void;
  onMoveArtifact: (artifactId: string, target: string) => Promise<void>;
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
              onDrop={() => onDropArtifactOnFolder(folder._id)}
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
              moveTargets={moveTargets}
              isDragging={dragArtifactId === artifact._id}
              isSelected={isArtifactSelected(artifact._id)}
              onSelect={() => onToggleArtifactContext(artifact._id)}
              onOpen={() => onOpenArtifact(artifact._id)}
              onRename={() => onRenameArtifact(artifact)}
              onDelete={() => onDeleteArtifact(artifact)}
              onMove={(target) => onMoveArtifact(artifact._id, target)}
              onDragStart={() => onDragArtifactStart(artifact._id)}
              onDragEnd={onDragArtifactEnd}
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
  onDrop,
}: {
  folder: FolderSummary;
  isDropTarget: boolean;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  onDrop: () => void;
}) {
  return (
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
          className="size-5 shrink-0 fill-[var(--lemon)] text-[var(--lemon)]"
          strokeWidth={1.25}
        />
        <span className="truncate text-[13px] font-medium text-foreground">{folder.name}</span>
      </button>
      <div className="shrink-0 pr-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-7"
              aria-label={`Aksi folder ${folder.name}`}
              onClick={(event) => event.stopPropagation()}
            >
              <MoreHorizontalIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={onRename}>
              <PenLineIcon className="size-4" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2Icon className="size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function ArtifactTile({
  artifact,
  moveTargets,
  isDragging,
  isSelected,
  onSelect,
  onOpen,
  onRename,
  onDelete,
  onMove,
  onDragStart,
  onDragEnd,
}: {
  artifact: WorkspaceArtifact;
  moveTargets: MoveTargetOption[];
  isDragging: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  onMove: (target: string) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const { handleClick, handleDoubleClick } = useDriveItemClick({
    onSingleClick: onSelect,
    onDoubleClick: onOpen,
  });

  return (
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
      <div className="absolute right-1.5 top-1.5 z-10 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <ArtifactActionsMenu
          moveTargets={moveTargets}
          onRename={onRename}
          onDelete={onDelete}
          onMove={onMove}
        />
      </div>
    </div>
  );
}

function ArtifactActionsMenu({
  moveTargets,
  onRename,
  onDelete,
  onMove,
}: {
  moveTargets: MoveTargetOption[];
  onRename: () => void;
  onDelete: () => void;
  onMove: (target: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" className="size-7" aria-label="Aksi artifact">
          <MoreHorizontalIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>Artifact</DropdownMenuLabel>
        <DropdownMenuItem onClick={onRename}>
          <PenLineIcon className="size-4" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <FolderIcon className="size-4" />
            Pindah ke
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {moveTargets.map((target) => (
              <DropdownMenuItem key={target.value} onClick={() => onMove(target.value)}>
                {target.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <Trash2Icon className="size-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

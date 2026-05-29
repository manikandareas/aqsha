"use client";

import { useMemo, useRef, useState } from "react";
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
import {
  applyMarqueeSelection,
  intersectingTargetIds,
  normalizeMarqueeRect,
  type MarqueePoint,
  type MarqueeRect,
} from "../utils/workspace-marquee-selection";

const MIN_MARQUEE_SIZE = 6;

export function WorkspaceDriveGrid({
  folders,
  artifacts,
  workspaceId,
  workspaces,
  moveTargets,
  dragArtifactId,
  isArtifactSelected,
  onToggleArtifactContext,
  onSetArtifactContextSelection,
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
  onSetArtifactContextSelection: (artifactIds: string[]) => void;
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
  const gridRef = useRef<HTMLDivElement | null>(null);
  const tileRefs = useRef(new Map<string, HTMLDivElement>());
  const [marquee, setMarquee] = useState<{
    start: MarqueePoint;
    current: MarqueePoint;
    mode: "add" | "toggle";
  } | null>(null);
  const [previewIds, setPreviewIds] = useState<string[]>([]);
  const [localSelectionRect, setLocalSelectionRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  const selectedArtifactIds = useMemo(
    () => artifacts.filter((artifact) => isArtifactSelected(artifact._id)).map((artifact) => artifact._id),
    [artifacts, isArtifactSelected],
  );
  const visibleArtifactIds = useMemo(
    () => artifacts.map((artifact) => artifact._id),
    [artifacts],
  );
  const previewIdSet = useMemo(() => new Set(previewIds), [previewIds]);
  const updatePreview = (rect: MarqueeRect) => {
    const targets = artifacts.map((artifact) => {
      const element = tileRefs.current.get(artifact._id);
      if (!element) return null;
      return { id: artifact._id, rect: element.getBoundingClientRect() };
    });
    setPreviewIds(intersectingTargetIds(rect, targets.filter((target) => target !== null)));
  };

  const endMarquee = () => {
    if (!marquee) return;
    const rect = normalizeMarqueeRect(marquee.start, marquee.current);
    const shouldCommit =
      rect.width >= MIN_MARQUEE_SIZE || rect.height >= MIN_MARQUEE_SIZE;

    if (shouldCommit && previewIds.length > 0) {
      onSetArtifactContextSelection(
        applyMarqueeSelection({
          currentIds: selectedArtifactIds,
          hitIds: previewIds,
          visibleIds: visibleArtifactIds,
          mode: marquee.mode,
        }),
      );
    }

    setMarquee(null);
    setPreviewIds([]);
    setLocalSelectionRect(null);
  };

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
        <div className="relative">
          {selectedArtifactIds.length > 0 || marquee ? (
            <div className="pointer-events-none absolute right-0 top-0 z-10 flex translate-y-[-calc(100%+0.5rem)] items-center gap-2 rounded-lg border border-border bg-card/95 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground shadow-sm">
              <span>{selectionCountLabel(marquee ? previewIds.length : selectedArtifactIds.length)}</span>
              {selectedArtifactIds.length > 0 ? (
                <button
                  type="button"
                  className="pointer-events-auto rounded-md px-1.5 py-0.5 text-foreground transition-colors hover:bg-muted"
                  onClick={() => onSetArtifactContextSelection([])}
                >
                  Bersihkan
                </button>
              ) : null}
            </div>
          ) : null}
          <div
            ref={gridRef}
            className={cn(driveArtifactGridClass, "relative")}
            onPointerDown={(event) => {
              if (event.button !== 0 || event.target !== event.currentTarget) return;
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              const point = { x: event.clientX, y: event.clientY };
              setMarquee({
                start: point,
                current: point,
                mode: event.metaKey || event.ctrlKey ? "toggle" : "add",
              });
              setLocalSelectionRect(
                toLocalRect(
                  normalizeMarqueeRect(point, point),
                  event.currentTarget.getBoundingClientRect(),
                ),
              );
              setPreviewIds([]);
            }}
            onPointerMove={(event) => {
              if (!marquee) return;
              const current = { x: event.clientX, y: event.clientY };
              const rect = normalizeMarqueeRect(marquee.start, current);
              setMarquee((state) => state ? { ...state, current } : state);
              setLocalSelectionRect(
                toLocalRect(rect, event.currentTarget.getBoundingClientRect()),
              );
              updatePreview(rect);
            }}
            onPointerUp={endMarquee}
            onPointerCancel={endMarquee}
          >
            {artifacts.map((artifact) => (
              <ArtifactTile
                key={artifact._id}
                refCallback={(element) => {
                  if (element) {
                    tileRefs.current.set(artifact._id, element);
                  } else {
                    tileRefs.current.delete(artifact._id);
                  }
                }}
                artifact={artifact}
                workspaceId={workspaceId}
                moveTargets={moveTargets}
                isDragging={dragArtifactId === artifact._id}
                isSelected={getPreviewSelectedState({
                  selected: isArtifactSelected(artifact._id),
                  previewed: previewIdSet.has(artifact._id),
                  mode: marquee?.mode ?? "add",
                })}
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
            {localSelectionRect ? (
              <div
                className="pointer-events-none absolute z-20 rounded-md border border-primary/60 bg-primary/10"
                style={{
                  left: localSelectionRect.left,
                  top: localSelectionRect.top,
                  width: localSelectionRect.width,
                  height: localSelectionRect.height,
                }}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function toLocalRect(rect: MarqueeRect, containerRect: DOMRect) {
  return {
    left: rect.left - containerRect.left,
    top: rect.top - containerRect.top,
    width: rect.width,
    height: rect.height,
  };
}

function getPreviewSelectedState({
  selected,
  previewed,
  mode,
}: {
  selected: boolean;
  previewed: boolean;
  mode: "add" | "toggle";
}) {
  if (!previewed) return selected;
  return mode === "toggle" ? !selected : true;
}

function selectionCountLabel(count: number) {
  return `${count} dipilih untuk konteks`;
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
  refCallback,
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
  refCallback: (element: HTMLDivElement | null) => void;
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
          ref={refCallback}
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
            artifactType={artifact.artifactType}
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

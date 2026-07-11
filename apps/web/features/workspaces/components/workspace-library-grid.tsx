"use client";

import { useRef, useState, type ReactNode } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { FolderIcon } from "@aqsha/ui/icons";
import { LibraryArtifactCard } from "@/components/library-artifact-card";
import { useLibraryItemClick } from "../hooks/use-library-item-click";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { libraryArtifactGridClass } from "@/lib/library-grid";
import { cn } from "@/lib/utils";
import {
  ArtifactContextMenuContent,
  FolderContextMenuContent,
} from "./workspace-library-context-menus";
import {
  type FolderSummary,
  type MoveTargetOption,
  type WorkspaceArtifact,
  type WorkspaceFolder,
} from "../utils/workspace-library-model";
import {
  applyMarqueeSelection,
  intersectingTargetIds,
  normalizeMarqueeRect,
  type MarqueePoint,
  type MarqueeRect,
} from "../utils/workspace-marquee-selection";

const MIN_MARQUEE_SIZE = 6;

type ArtifactItemHandlers = {
  workspaceId: string;
  workspaces: Array<{ _id: string; name: string }>;
  moveTargets: MoveTargetOption[];
  /** Ids of every card in the active drag (>1 when dragging a multi-selection). */
  draggingArtifactIds: string[];
  getArtifactSelected: (artifactId: string) => boolean;
  onToggleArtifactContext: (artifactId: string) => void;
  onSetArtifactContextSelection: (artifactIds: string[]) => void;
  onOpenArtifact: (artifactId: string) => void;
  onRenameArtifact: (artifact: WorkspaceArtifact) => void;
  onDeleteArtifact: (artifact: WorkspaceArtifact) => void;
  onMoveArtifact: (artifactId: string, target: string) => Promise<void>;
  onMoveArtifactToWorkspace: (artifactId: string, targetWorkspaceId: string) => Promise<void>;
  /** Fase 2 bridge — hanya diteruskan untuk paper saat Citation Manager aktif. */
  onAddToCitations?: (artifact: WorkspaceArtifact) => void;
};

export function WorkspaceLibraryGrid({
  folders,
  artifacts,
  workspaceId,
  workspaces,
  moveTargets,
  draggingArtifactIds,
  getArtifactSelected,
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
  onAddToCitations,
}: {
  folders: FolderSummary[];
  artifacts: WorkspaceArtifact[];
  workspaceId: string;
  workspaces: Array<{ _id: string; name: string }>;
  moveTargets: MoveTargetOption[];
  draggingArtifactIds: string[];
  getArtifactSelected: (artifactId: string) => boolean;
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
  onAddToCitations?: (artifact: WorkspaceArtifact) => void;
}) {
  // Grid tunggal: folder + semua artifak folder-scoped (pustaka user maupun
  // output agent). Kartu agent dibedakan lewat badge/aksen di kartunya sendiri.
  const selectedIds = artifacts.flatMap((artifact) =>
    getArtifactSelected(artifact._id) ? [artifact._id] : [],
  );

  const itemHandlers: ArtifactItemHandlers = {
    workspaceId,
    workspaces,
    moveTargets,
    draggingArtifactIds,
    getArtifactSelected,
    onToggleArtifactContext,
    onSetArtifactContextSelection,
    onOpenArtifact,
    onRenameArtifact,
    onDeleteArtifact,
    onMoveArtifact,
    onMoveArtifactToWorkspace,
    onAddToCitations,
  };

  return (
    <div className="flex flex-col gap-6">
      {folders.length > 0 ? (
        <section className="flex flex-wrap gap-2">
          {folders.map((folder) => (
            <FolderTile
              key={folder._id}
              folder={folder}
              onOpen={() => onOpenFolder(folder._id)}
              onRename={() => onRenameFolder(folder)}
              onDelete={() => onDeleteFolder(folder)}
              onMoveToWorkspace={(targetWorkspaceId) =>
                onMoveFolderToWorkspace(folder._id, targetWorkspaceId)
              }
              workspaces={workspaces}
            />
          ))}
        </section>
      ) : null}

      {artifacts.length > 0 ? (
        <ArtifactSection
          artifacts={artifacts}
          selectedIds={selectedIds}
          {...itemHandlers}
        />
      ) : null}
    </div>
  );
}

export function ArtifactSection({
  title,
  artifacts,
  selectedIds,
  controls,
  emptyState,
  workspaceId,
  workspaces,
  moveTargets,
  draggingArtifactIds,
  getArtifactSelected,
  onToggleArtifactContext,
  onSetArtifactContextSelection,
  onOpenArtifact,
  onRenameArtifact,
  onDeleteArtifact,
  onMoveArtifact,
  onMoveArtifactToWorkspace,
  onAddToCitations,
}: ArtifactItemHandlers & {
  title?: string;
  artifacts: WorkspaceArtifact[];
  selectedIds: string[];
  controls?: ReactNode;
  emptyState?: ReactNode;
}) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const tileRefs = useRef<Map<string, HTMLDivElement> | null>(null);
  if (tileRefs.current === null) {
    tileRefs.current = new Map();
  }
  const tileElementRefs = tileRefs.current;
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

  const visibleArtifactIds = artifacts.map((artifact) => artifact._id);
  const previewIdSet = new Set(previewIds);
  // Every card in the active drag dims together — not just the grabbed one —
  // so a multi-selection visibly lifts out as a group.
  const draggingIdSet = new Set(draggingArtifactIds);
  const updatePreview = (rect: MarqueeRect) => {
    const targets = artifacts.flatMap((artifact) => {
      const element = tileElementRefs.get(artifact._id);
      if (!element) return [];
      return [{ id: artifact._id, rect: element.getBoundingClientRect() }];
    });
    setPreviewIds(intersectingTargetIds(rect, targets));
  };

  const endMarquee = () => {
    if (!marquee) return;
    const rect = normalizeMarqueeRect(marquee.start, marquee.current);
    const shouldCommit =
      rect.width >= MIN_MARQUEE_SIZE || rect.height >= MIN_MARQUEE_SIZE;

    if (shouldCommit && previewIds.length > 0) {
      onSetArtifactContextSelection(
        applyMarqueeSelection({
          currentIds: selectedIds,
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
    <section className="flex flex-col gap-5">
      {title || controls ? (
        <LibrarySectionHeader title={title ?? ""} controls={controls} />
      ) : null}
      {artifacts.length > 0 ? (
        <div
          ref={gridRef}
          className={cn(libraryArtifactGridClass, "relative")}
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
            setMarquee((state) => (state ? { ...state, current } : state));
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
                  tileElementRefs.set(artifact._id, element);
                } else {
                  tileElementRefs.delete(artifact._id);
                }
              }}
              artifact={artifact}
              workspaceId={workspaceId}
              moveTargets={moveTargets}
              isBeingDragged={draggingIdSet.has(artifact._id)}
              isSelected={getPreviewSelectedState({
                selected: getArtifactSelected(artifact._id),
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
              onAddToCitations={
                onAddToCitations && artifact.detectedDocumentKind === "scholarly_paper"
                  ? () => onAddToCitations(artifact)
                  : undefined
              }
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
      ) : (
        emptyState
      )}
    </section>
  );
}

function LibrarySectionHeader({
  title,
  controls,
}: {
  title: string;
  controls?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 items-center gap-5">
        <h2 className="shrink-0 text-[15px] font-semibold leading-none text-foreground">
          {title}
        </h2>
        <div className="h-px min-w-0 flex-1 bg-border/70" />
      </div>
      {controls ? (
        <div className="flex shrink-0 justify-start sm:justify-end">
          {controls}
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

function FolderTile({
  folder,
  onOpen,
  onRename,
  onDelete,
  onMoveToWorkspace,
  workspaces,
}: {
  folder: FolderSummary;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  onMoveToWorkspace: (targetWorkspaceId: string) => void;
  workspaces: Array<{ _id: string; name: string }>;
}) {
  // Drop target for the dnd-kit drag: `active` is set while any card is being
  // dragged (so all folders hint they can receive it), `isOver` is the one the
  // pointer is currently hovering (so it pops to confirm the drop).
  const { setNodeRef, isOver, active } = useDroppable({ id: folder._id });
  const isDragActive = active !== null;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          className={cn(
            "group relative inline-flex max-w-full items-center rounded-lg hover:bg-muted/50",
            "motion-safe:transition-[transform,background-color,box-shadow] motion-safe:duration-150 motion-safe:ease-out",
            isDragActive && "ring-1 ring-primary/25",
            isOver && "-translate-y-0.5 scale-[1.03] bg-primary/10 ring-2 ring-primary/60",
          )}
        >
          <button
            type="button"
            onDoubleClick={onOpen}
            className="inline-flex min-w-0 items-center gap-2.5 py-2 pl-2.5 pr-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label={`Folder ${folder.name}. Klik dua kali untuk membuka.`}
          >
            <FolderIcon
              className={cn(
                "size-5 shrink-0 fill-lemon text-lemon motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out",
                isOver && "scale-110",
              )}
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

export function ArtifactTile({
  refCallback,
  artifact,
  workspaceId,
  moveTargets,
  isBeingDragged,
  isSelected,
  onSelect,
  onOpen,
  onRename,
  onDelete,
  onMove,
  onMoveToWorkspace,
  onAddToCitations,
  workspaces,
}: {
  refCallback: (element: HTMLDivElement | null) => void;
  artifact: WorkspaceArtifact;
  workspaceId: string;
  moveTargets: MoveTargetOption[];
  workspaces: Array<{ _id: string; name: string }>;
  isBeingDragged: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  onMove: (target: string) => void;
  onMoveToWorkspace: (targetWorkspaceId: string) => void;
  onAddToCitations?: () => void;
}) {
  const { selectLibraryItem, openLibraryItem } = useLibraryItemClick({
    onSingleClick: onSelect,
    onDoubleClick: onOpen,
  });

  // While ingestion runs (or fails) the card is shown in a non-interactive
  // loading state; it "matures" into a normal clickable card once ready.
  const isProcessing =
    artifact.indexingStatus === "pending" || artifact.indexingStatus === "failed";
  const processingFailed = artifact.indexingStatus === "failed";

  // dnd-kit drag source. The pointer sensor only activates after a small move
  // (see the board), so plain clicks still fall through to select/open. We omit
  // `attributes` on purpose: the card already nests a real <button>, so adding
  // role="button"/tabIndex here would duplicate it in the focus/AX tree.
  const { listeners, setNodeRef } = useDraggable({
    id: artifact._id,
    disabled: isProcessing,
  });
  // The dnd measurement ref and the marquee-measurement ref both need the node.
  const setRefs = (node: HTMLDivElement | null) => {
    setNodeRef(node);
    refCallback(node);
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setRefs}
          {...listeners}
          className={cn(
            "group relative motion-safe:transition-opacity motion-safe:duration-150",
            isBeingDragged && "opacity-40",
          )}
        >
          <LibraryArtifactCard
            title={artifact.title}
            artifactType={artifact.artifactType}
            source={artifact.source}
            createdAt={artifact.createdAt}
            isSelected={isSelected}
            isProcessing={isProcessing}
            processingFailed={processingFailed}
            onClick={selectLibraryItem}
            onDoubleClick={openLibraryItem}
          />
        </div>
      </ContextMenuTrigger>
      <ArtifactContextMenuContent
        moveTargets={moveTargets}
        workspaces={workspaces}
        artifactHref={`/app/workspaces/${workspaceId}/artifacts/${artifact._id}`}
        isSelected={isSelected}
        onSelect={onSelect}
        onOpen={onOpen}
        onRename={onRename}
        onDelete={onDelete}
        onMove={onMove}
        onMoveToWorkspace={onMoveToWorkspace}
        onAddToCitations={onAddToCitations}
      />
    </ContextMenu>
  );
}

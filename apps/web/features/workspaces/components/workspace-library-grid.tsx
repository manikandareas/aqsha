"use client";

import { useRef, useState, type ReactNode } from "react";
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
  partitionArtifactsByCategory,
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
  dragArtifactId: string | null;
  getArtifactSelected: (artifactId: string) => boolean;
  onToggleArtifactContext: (artifactId: string) => void;
  onSetArtifactContextSelection: (artifactIds: string[]) => void;
  onOpenArtifact: (artifactId: string) => void;
  onRenameArtifact: (artifact: WorkspaceArtifact) => void;
  onDeleteArtifact: (artifact: WorkspaceArtifact) => void;
  onMoveArtifact: (artifactId: string, target: string) => Promise<void>;
  onMoveArtifactToWorkspace: (artifactId: string, targetWorkspaceId: string) => Promise<void>;
  onDragArtifactStart: (artifactId: string) => void;
  onDragArtifactEnd: () => void;
};

export function WorkspaceLibraryGrid({
  folders,
  artifacts,
  workspaceId,
  workspaces,
  moveTargets,
  dragArtifactId,
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
  onDragArtifactStart,
  onDragArtifactEnd,
  onDropArtifactOnFolder,
  controls,
}: {
  folders: FolderSummary[];
  artifacts: WorkspaceArtifact[];
  workspaceId: string;
  workspaces: Array<{ _id: string; name: string }>;
  moveTargets: MoveTargetOption[];
  dragArtifactId: string | null;
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
  onDragArtifactStart: (artifactId: string) => void;
  onDragArtifactEnd: () => void;
  onDropArtifactOnFolder: (folderId: string) => void;
  controls?: ReactNode;
}) {
  const { library, output } = partitionArtifactsByCategory(artifacts);
  // When there are no artifacts at all (folders-only view) we skip the two
  // section shells so the board doesn't show a double "empty" — the fully-empty
  // workspace case is handled upstream by WorkspaceLibraryEmpty.
  const hasAnyArtifacts = library.length > 0 || output.length > 0;
  // Full selection across both sections, used as marquee `currentIds` so a
  // marquee in one section never wipes the other section's selection.
  const selectedIds = artifacts.flatMap((artifact) =>
    getArtifactSelected(artifact._id) ? [artifact._id] : [],
  );

  const itemHandlers: ArtifactItemHandlers = {
    workspaceId,
    workspaces,
    moveTargets,
    dragArtifactId,
    getArtifactSelected,
    onToggleArtifactContext,
    onSetArtifactContextSelection,
    onOpenArtifact,
    onRenameArtifact,
    onDeleteArtifact,
    onMoveArtifact,
    onMoveArtifactToWorkspace,
    onDragArtifactStart,
    onDragArtifactEnd,
  };

  return (
    <div className="flex flex-col gap-9">
      {folders.length > 0 ? (
        <section className="flex flex-col gap-5">
          <LibrarySectionHeader title="Folders" />
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
        </section>
      ) : null}

      {hasAnyArtifacts ? (
        <>
          <ArtifactSection
            title={`Pustaka (${library.length})`}
            artifacts={library}
            selectedIds={selectedIds}
            controls={controls}
            emptyState={
              <SectionEmpty message="Belum ada bahan riset di sini. Tambahkan dokumen, file, atau URL untuk mulai." />
            }
            {...itemHandlers}
          />

          <ArtifactSection
            title={`Artifact (${output.length})`}
            artifacts={output}
            selectedIds={selectedIds}
            emptyState={
              <SectionEmpty message="Belum ada artifact. Minta agent membuat laporan atau visualisasi lewat chat." />
            }
            {...itemHandlers}
          />
        </>
      ) : null}
    </div>
  );
}

function ArtifactSection({
  title,
  artifacts,
  selectedIds,
  controls,
  emptyState,
  workspaceId,
  workspaces,
  moveTargets,
  dragArtifactId,
  getArtifactSelected,
  onToggleArtifactContext,
  onSetArtifactContextSelection,
  onOpenArtifact,
  onRenameArtifact,
  onDeleteArtifact,
  onMoveArtifact,
  onMoveArtifactToWorkspace,
  onDragArtifactStart,
  onDragArtifactEnd,
}: ArtifactItemHandlers & {
  title: string;
  artifacts: WorkspaceArtifact[];
  selectedIds: string[];
  controls?: ReactNode;
  emptyState: ReactNode;
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

  const sectionSelectedCount = artifacts.reduce(
    (count, artifact) => (getArtifactSelected(artifact._id) ? count + 1 : count),
    0,
  );
  const visibleArtifactIds = artifacts.map((artifact) => artifact._id);
  const previewIdSet = new Set(previewIds);
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
      <LibrarySectionHeader title={title} controls={controls} />
      {artifacts.length > 0 ? (
        <div className="relative">
          {sectionSelectedCount > 0 || marquee ? (
            <div className="pointer-events-none absolute right-0 top-0 z-10 flex translate-y-[-calc(100%+0.5rem)] items-center gap-2 rounded-lg border border-border bg-card/95 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground shadow-sm">
              <span>
                {selectionCountLabel(marquee ? previewIds.length : sectionSelectedCount)}
              </span>
              {sectionSelectedCount > 0 ? (
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
                isDragging={dragArtifactId === artifact._id}
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
      ) : (
        emptyState
      )}
    </section>
  );
}

function SectionEmpty({ message }: { message: string }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-border bg-muted/15 px-6 py-10 text-center">
      <p className="max-w-sm text-[13px] font-medium text-muted-foreground">{message}</p>
    </div>
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
  const { selectLibraryItem, openLibraryItem } = useLibraryItemClick({
    onSingleClick: onSelect,
    onDoubleClick: onOpen,
  });

  // While ingestion runs (or fails) the card is shown in a non-interactive
  // loading state; it "matures" into a normal clickable card once ready.
  const isProcessing =
    artifact.indexingStatus === "pending" || artifact.indexingStatus === "failed";
  const processingFailed = artifact.indexingStatus === "failed";

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={refCallback}
          className={cn("group relative", isDragging && "opacity-50")}
          draggable={!isProcessing}
          onDragStart={(event) => {
            if (isProcessing) {
              event.preventDefault();
              return;
            }
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", artifact._id);
            onDragStart();
          }}
          onDragEnd={onDragEnd}
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
      />
    </ContextMenu>
  );
}

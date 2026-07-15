<script module lang="ts">
	export type FolderDropState = {
		/** True while ANY card is being dragged (so every folder hints it can receive it). */
		active: boolean;
		/** True for the folder the pointer is currently over (so it pops to confirm the drop). */
		isOver: boolean;
	};

	/** Container-relative marquee overlay rectangle (board-driven when `enableMarquee={false}`). */
	export type MarqueeOverlayRect = {
		left: number;
		top: number;
		width: number;
		height: number;
	};
</script>

<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { Icon, FolderIcon } from '$lib/icons';
	import * as ContextMenu from '$lib/components/ui/context-menu';
	import LibraryArtifactCard from '$lib/components/LibraryArtifactCard.svelte';
	import { libraryArtifactGridClass } from '../utils/library-grid';
	import { cn } from '$lib/utils';
	import ArtifactContextMenuContent from './ArtifactContextMenuContent.svelte';
	import FolderContextMenuContent from './FolderContextMenuContent.svelte';
	import type { ArtifactSource } from '$lib/components/artifact-presentation';
	import type {
		FolderSummary,
		MoveTargetOption,
		WorkspaceArtifact,
		WorkspaceFolder
	} from '$lib/features/workspaces/utils/workspace-library-model';
	import {
		applyMarqueeSelection,
		intersectingTargetIds,
		normalizeMarqueeRect,
		type MarqueePoint,
		type MarqueeRect
	} from '$lib/features/workspaces/utils/workspace-marquee-selection';

	/**
	 * Presentational library grid — port of `apps/web/features/workspaces/components/
	 * workspace-library-grid.tsx` (folders + artifact cards + marquee overlay). The dnd-kit
	 * per-tile draggable / per-folder droppable is NOT ported (no dnd-kit in Svelte); instead the
	 * board wires drag/drop through the `gridAttach` / `foldersAttach` attachment seams, the
	 * `getFolderDropState` highlight callback, `draggingArtifactIds` (card dimming), and the
	 * `data-artifact-tile-id` / `data-folder-tile-id` hooks. The marquee (pointer logic + hit-test +
	 * overlay) is self-contained here (uses the ported `workspace-marquee-selection` utils); set
	 * `enableMarquee={false}` to fully own selection from the board and drive the overlay via
	 * `marqueeRect`.
	 */
	const MIN_MARQUEE_SIZE = 6;
	const CLICK_DELAY_MS = 250;

	let {
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
		// Board seam (Phase 9 DnD + optional board-driven marquee).
		enableMarquee = true,
		gridAttach,
		foldersAttach,
		getFolderDropState,
		marqueeRect,
		// Native HTML5 DnD (card → folder), driven by the board.
		onArtifactDragStart,
		onArtifactDragEnd,
		onFolderDragEnter,
		onFolderDragLeave,
		onFolderDrop
	}: {
		folders: FolderSummary[];
		artifacts: WorkspaceArtifact[];
		workspaceId: string;
		workspaces: Array<{ _id: string; name: string }>;
		moveTargets: MoveTargetOption[];
		/** Ids of every card in the active drag (>1 when dragging a multi-selection). */
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
		/** Set false to fully own selection/marquee from the board (still renders `marqueeRect`). */
		enableMarquee?: boolean;
		/** Board attachment on the artifact grid container (e.g. `svelte-dnd-action` dndzone). */
		gridAttach?: Attachment<HTMLDivElement>;
		/** Board attachment on the folders row (e.g. a drop-zone for card-onto-folder). */
		foldersAttach?: Attachment<HTMLElement>;
		/** Board-driven folder drop highlight — `{ active, isOver }` per folder id. */
		getFolderDropState?: (folderId: string) => FolderDropState;
		/** Board-driven marquee overlay rect (used when `enableMarquee={false}`). */
		marqueeRect?: MarqueeOverlayRect | null;
		/** Native drag lifecycle (board resolves the multi-selection drag set + clears it). */
		onArtifactDragStart?: (grabbedId: string) => void;
		onArtifactDragEnd?: () => void;
		/** Folder drop targets (board tracks the hovered folder + performs the move). */
		onFolderDragEnter?: (folderId: string) => void;
		onFolderDragLeave?: (folderId: string) => void;
		onFolderDrop?: (folderId: string) => void;
	} = $props();

	// Grid tunggal: folder + semua artifak folder-scoped (pustaka user maupun output agent). Kartu
	// agent dibedakan lewat badge/aksen di kartunya sendiri.
	const selectedIds = $derived(
		artifacts.flatMap((artifact) => (getArtifactSelected(artifact._id) ? [artifact._id] : []))
	);
	const visibleArtifactIds = $derived(artifacts.map((artifact) => artifact._id));

	// Stable attachment wrappers so the board's optional attach seams can be applied unconditionally.
	const gridContainerAttach: Attachment<HTMLDivElement> = (node) => gridAttach?.(node);
	const foldersContainerAttach: Attachment<HTMLElement> = (node) => foldersAttach?.(node);

	function folderDropState(folderId: string): FolderDropState {
		return getFolderDropState?.(folderId) ?? { active: false, isOver: false };
	}

	function isProcessing(artifact: WorkspaceArtifact): boolean {
		return artifact.indexingStatus === 'pending' || artifact.indexingStatus === 'failed';
	}

	// --- Single-vs-double click (mirror of web `useLibraryItemClick`) ------------------------------
	// Per-card debounce timers; a plain registry (not reactive state).
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient timer registry, never rendered
	const clickTimers = new Map<string, ReturnType<typeof setTimeout>>();

	function clearClickTimer(id: string) {
		const timer = clickTimers.get(id);
		if (timer) {
			clearTimeout(timer);
			clickTimers.delete(id);
		}
	}

	function selectLibraryItem(id: string) {
		clearClickTimer(id);
		clickTimers.set(
			id,
			setTimeout(() => {
				onToggleArtifactContext(id);
				clickTimers.delete(id);
			}, CLICK_DELAY_MS)
		);
	}

	function openLibraryItem(id: string) {
		clearClickTimer(id);
		onOpenArtifact(id);
	}

	$effect(() => () => {
		for (const timer of clickTimers.values()) clearTimeout(timer);
		clickTimers.clear();
	});

	// --- Marquee (self-contained; toggleable via `enableMarquee`) ---------------------------------
	let gridEl = $state<HTMLDivElement | null>(null);
	let marquee = $state<{
		start: MarqueePoint;
		current: MarqueePoint;
		mode: 'add' | 'toggle';
	} | null>(null);
	let previewIds = $state<string[]>([]);
	let localSelectionRect = $state<MarqueeOverlayRect | null>(null);

	const overlayRect = $derived(enableMarquee ? localSelectionRect : (marqueeRect ?? null));

	function toLocalRect(rect: MarqueeRect, containerRect: DOMRect): MarqueeOverlayRect {
		return {
			left: rect.left - containerRect.left,
			top: rect.top - containerRect.top,
			width: rect.width,
			height: rect.height
		};
	}

	function collectTileTargets() {
		if (!gridEl) return [];
		return Array.from(gridEl.querySelectorAll<HTMLElement>('[data-artifact-tile-id]')).map(
			(element) => ({
				id: element.dataset.artifactTileId ?? '',
				rect: element.getBoundingClientRect()
			})
		);
	}

	function updatePreview(rect: MarqueeRect) {
		previewIds = intersectingTargetIds(rect, collectTileTargets());
	}

	function tileSelected(id: string): boolean {
		const selected = getArtifactSelected(id);
		if (!enableMarquee || !previewIds.includes(id)) return selected;
		return (marquee?.mode ?? 'add') === 'toggle' ? !selected : true;
	}

	function handleGridPointerDown(event: PointerEvent) {
		if (event.button !== 0 || event.target !== event.currentTarget) return;
		event.preventDefault();
		const container = event.currentTarget as HTMLElement;
		container.setPointerCapture(event.pointerId);
		const point = { x: event.clientX, y: event.clientY };
		marquee = {
			start: point,
			current: point,
			mode: event.metaKey || event.ctrlKey ? 'toggle' : 'add'
		};
		localSelectionRect = toLocalRect(
			normalizeMarqueeRect(point, point),
			container.getBoundingClientRect()
		);
		previewIds = [];
	}

	function handleGridPointerMove(event: PointerEvent) {
		if (!marquee) return;
		const current = { x: event.clientX, y: event.clientY };
		const rect = normalizeMarqueeRect(marquee.start, current);
		marquee = { ...marquee, current };
		localSelectionRect = toLocalRect(
			rect,
			(event.currentTarget as HTMLElement).getBoundingClientRect()
		);
		updatePreview(rect);
	}

	function endMarquee() {
		if (!marquee) return;
		const rect = normalizeMarqueeRect(marquee.start, marquee.current);
		const shouldCommit = rect.width >= MIN_MARQUEE_SIZE || rect.height >= MIN_MARQUEE_SIZE;

		if (shouldCommit && previewIds.length > 0) {
			onSetArtifactContextSelection(
				applyMarqueeSelection({
					currentIds: selectedIds,
					hitIds: previewIds,
					visibleIds: visibleArtifactIds,
					mode: marquee.mode
				})
			);
		}

		marquee = null;
		previewIds = [];
		localSelectionRect = null;
	}

	function artifactHref(artifactId: string) {
		return `/app/workspaces/${workspaceId}/artifacts/${artifactId}`;
	}
</script>

{#snippet folderTile(folder: FolderSummary)}
	{@const drop = folderDropState(folder._id)}
	<ContextMenu.Root>
		<ContextMenu.Trigger>
			{#snippet child({ props })}
				<div
					{...props}
					data-folder-tile-id={folder._id}
					role="group"
					ondragover={(event) => {
						if (!drop.active) return;
						event.preventDefault();
						if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
					}}
					ondragenter={(event) => {
						if (!drop.active) return;
						event.preventDefault();
						onFolderDragEnter?.(folder._id);
					}}
					ondragleave={(event) => {
						const currentTarget = event.currentTarget as Node | null;
						if (!currentTarget?.contains(event.relatedTarget as Node | null))
							onFolderDragLeave?.(folder._id);
					}}
					ondrop={(event) => {
						if (!drop.active) return;
						event.preventDefault();
						onFolderDrop?.(folder._id);
					}}
					class={cn(
						'group relative inline-flex max-w-full items-center rounded-lg hover:bg-muted/50',
						'motion-safe:transition-[transform,background-color,box-shadow] motion-safe:duration-150 motion-safe:ease-out',
						drop.active && 'ring-1 ring-primary/25',
						drop.isOver && '-translate-y-0.5 scale-[1.03] bg-primary/10 ring-2 ring-primary/60'
					)}
				>
					<button
						type="button"
						ondblclick={() => onOpenFolder(folder._id)}
						class="inline-flex min-w-0 items-center gap-2.5 py-2 pl-2.5 pr-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
						aria-label={`Folder ${folder.name}. Klik dua kali untuk membuka.`}
					>
						<Icon
							icon={FolderIcon}
							class={cn(
								'size-5 shrink-0 fill-lemon text-lemon motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out',
								drop.isOver && 'scale-110'
							)}
							strokeWidth={1.25}
						/>
						<span class="truncate text-[13px] font-medium text-foreground">{folder.name}</span>
					</button>
				</div>
			{/snippet}
		</ContextMenu.Trigger>
		<FolderContextMenuContent
			{workspaces}
			onOpen={() => onOpenFolder(folder._id)}
			onRename={() => onRenameFolder(folder)}
			onDelete={() => onDeleteFolder(folder)}
			onMoveToWorkspace={(targetWorkspaceId) =>
				onMoveFolderToWorkspace(folder._id, targetWorkspaceId)}
		/>
	</ContextMenu.Root>
{/snippet}

{#snippet artifactTile(artifact: WorkspaceArtifact)}
	<ContextMenu.Root>
		<ContextMenu.Trigger>
			{#snippet child({ props })}
				<div
					{...props}
					data-artifact-tile-id={artifact._id}
					draggable={!isProcessing(artifact)}
					ondragstart={(event) => {
						if (isProcessing(artifact)) return;
						event.dataTransfer?.setData('text/plain', artifact._id);
						if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
						onArtifactDragStart?.(artifact._id);
					}}
					ondragend={() => onArtifactDragEnd?.()}
					class={cn(
						'group relative motion-safe:transition-opacity motion-safe:duration-150',
						draggingArtifactIds.includes(artifact._id) && 'opacity-40'
					)}
				>
					<LibraryArtifactCard
						title={artifact.title}
						artifactType={artifact.artifactType}
						source={artifact.source as ArtifactSource | undefined}
						createdAt={artifact.createdAt}
						isSelected={tileSelected(artifact._id)}
						isProcessing={isProcessing(artifact)}
						processingFailed={artifact.indexingStatus === 'failed'}
						onClick={() => selectLibraryItem(artifact._id)}
						onDoubleClick={() => openLibraryItem(artifact._id)}
					/>
				</div>
			{/snippet}
		</ContextMenu.Trigger>
		<ArtifactContextMenuContent
			{moveTargets}
			{workspaces}
			artifactHref={artifactHref(artifact._id)}
			isSelected={tileSelected(artifact._id)}
			onSelect={() => onToggleArtifactContext(artifact._id)}
			onOpen={() => onOpenArtifact(artifact._id)}
			onRename={() => onRenameArtifact(artifact)}
			onDelete={() => onDeleteArtifact(artifact)}
			onMove={(target) => onMoveArtifact(artifact._id, target)}
			onMoveToWorkspace={(targetWorkspaceId) =>
				onMoveArtifactToWorkspace(artifact._id, targetWorkspaceId)}
			onAddToCitations={onAddToCitations && artifact.detectedDocumentKind === 'scholarly_paper'
				? () => onAddToCitations(artifact)
				: undefined}
		/>
	</ContextMenu.Root>
{/snippet}

<div class="flex flex-col gap-6">
	{#if folders.length > 0}
		<section class="flex flex-wrap gap-2" {@attach foldersContainerAttach}>
			{#each folders as folder (folder._id)}
				{@render folderTile(folder)}
			{/each}
		</section>
	{/if}

	{#if artifacts.length > 0}
		<section class="flex flex-col gap-5">
			<!-- marquee is a pointer-only enhancement; the interactive controls are the cards inside -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				bind:this={gridEl}
				class={cn(libraryArtifactGridClass, 'relative')}
				{@attach gridContainerAttach}
				onpointerdown={enableMarquee ? handleGridPointerDown : undefined}
				onpointermove={enableMarquee ? handleGridPointerMove : undefined}
				onpointerup={enableMarquee ? endMarquee : undefined}
				onpointercancel={enableMarquee ? endMarquee : undefined}
			>
				{#each artifacts as artifact (artifact._id)}
					{@render artifactTile(artifact)}
				{/each}
				{#if overlayRect}
					<div
						class="pointer-events-none absolute z-20 rounded-md border border-primary/60 bg-primary/10"
						style="left: {overlayRect.left}px; top: {overlayRect.top}px; width: {overlayRect.width}px; height: {overlayRect.height}px;"
					></div>
				{/if}
			</div>
		</section>
	{/if}
</div>

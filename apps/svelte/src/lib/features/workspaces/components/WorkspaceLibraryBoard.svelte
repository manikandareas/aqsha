<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as ContextMenu from '@aqsha/ui-svelte/components/context-menu';
	import { Icon, FileTextIcon, FolderIcon, LinkIcon, UploadIcon } from '$lib/icons';
	import { cn } from '@aqsha/ui-svelte/utils';
	import {
		panelBodyColumnClass,
		panelBodyPaddingClass,
		panelCardToolbarClass
	} from '$lib/components/layout/panel-surface';
	import { DOCUMENT_AUTHORING_ENABLED } from '$lib/features/workspaces/document-authoring';
	import { useFileDropzone } from '../hooks/use-file-dropzone.svelte';
	import { createWorkspaceFolderNav } from '../hooks/use-workspace-folder-nav.svelte';
	import {
		applyWorkspaceArtifactControls,
		getFolderView,
		getMoveTargetOptions,
		getUploadTargetFolderId,
		getWorkspaceMoveTargetOptions,
		groupArtifactsByFolder,
		type WorkspaceArtifact,
		type WorkspaceArtifactSort,
		type WorkspaceArtifactType,
		type WorkspaceFolder
	} from '../utils/workspace-library-model';
	import {
		WORKSPACE_UPLOAD_ACCEPT,
		type WorkspaceUploadProgressEvent,
		type WorkspaceUploadResult
	} from '../utils/workspace-file-upload';
	import WorkspaceBoardToolbar from './WorkspaceBoardToolbar.svelte';
	import WorkspaceLibraryControls from './WorkspaceLibraryControls.svelte';
	import WorkspaceLibraryEmpty from './WorkspaceLibraryEmpty.svelte';
	import WorkspaceLibraryFootnote from './WorkspaceLibraryFootnote.svelte';
	import WorkspaceLibraryGrid, { type FolderDropState } from './WorkspaceLibraryGrid.svelte';
	import WorkspaceUploadToast from './WorkspaceUploadToast.svelte';

	/**
	 * The workspace library board. Owns folder nav (`?folder=`), the DnD drag set (native HTML5,
	 * card → folder), the upload queue toast, and the board-level right-click menu; renders the toolbar +
	 * grid/empty + footnote + the surface's dialog stack.
	 *
	 * Uses native HTML5 DnD (no dnd-kit) — no fanned drag overlay or touch-keyboard drag; marquee
	 * (grid-owned) + drag-to-folder work for mouse.
	 */
	let {
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
		variant = 'page'
	}: {
		workspaceName: string;
		workspaceEmoji?: string;
		workspaceId: string;
		titleSlot?: Snippet;
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
		onMoveArtifactToWorkspace: (artifactId: string, targetWorkspaceId: string) => Promise<void>;
		onMoveFolderToWorkspace: (folderId: string, targetWorkspaceId: string) => Promise<void>;
		onUploadFiles: (
			files: File[],
			folderId: 'root' | string,
			options?: { onFileChange?: (event: WorkspaceUploadProgressEvent) => void }
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
		renderDialogs?: Snippet<
			[
				activeFolderId: 'root' | string,
				activeFolderName: string,
				onUploadFiles: (files: File[]) => void
			]
		>;
		showCreateActions?: boolean;
		showWorkspaceSettings?: boolean;
		variant?: 'page' | 'panel';
	} = $props();

	// --- Derived board model --------------------------------------------------------------------------
	const filteredArtifacts = $derived(
		applyWorkspaceArtifactControls({ artifacts, query: searchQuery, types: selectedTypes, sort })
	);
	const groups = $derived(groupArtifactsByFolder({ folders, artifacts: filteredArtifacts, sort }));
	const folderNav = createWorkspaceFolderNav(() => groups);
	const folderView = $derived(getFolderView({ groups, activeFolderId: folderNav.activeFolderId }));
	const moveTargets = $derived(getMoveTargetOptions(folders));
	const workspaceMoveTargets = $derived(
		getWorkspaceMoveTargetOptions(workspaces, workspaceId).map((target) => ({
			_id: target.value,
			name: target.label
		}))
	);

	const hasFilter = $derived(searchQuery.trim().length > 0 || selectedTypes.length > 0);
	const boardEmpty = $derived(folderView.folders.length === 0 && folderView.artifacts.length === 0);
	const rawArtifactCount = $derived(
		artifacts.filter((artifact) => artifact.status !== 'deleted').length
	);
	const boardFilteredEmpty = $derived(boardEmpty && hasFilter && rawArtifactCount > 0);
	const isRootFolder = $derived(folderView.activeFolderId === 'root');
	const activeFolderName = $derived(
		isRootFolder ? workspaceName : (folderView.breadcrumb.at(-1)?.label ?? 'Folder')
	);
	const activeBadgeEmoji = $derived(isRootFolder ? workspaceEmoji : undefined);
	const showFootnote = $derived(!boardEmpty);
	const canCreate = $derived(showCreateActions ?? true);
	const dialogFolderName = $derived(
		folderView.activeFolderId === 'root' ? '' : (folderView.breadcrumb.at(-1)?.label ?? '')
	);

	// --- Native drag (card → folder) ------------------------------------------------------------------
	let dragArtifactIds = $state<string[]>([]);
	let overFolderId = $state<string | null>(null);

	function onArtifactDragStart(grabbedId: string) {
		const selectedIds = folderView.artifacts
			.filter((artifact) => getArtifactSelected(artifact._id))
			.map((artifact) => artifact._id);
		dragArtifactIds =
			selectedIds.length > 1 && selectedIds.includes(grabbedId)
				? [grabbedId, ...selectedIds.filter((id) => id !== grabbedId)]
				: [grabbedId];
	}
	function onArtifactDragEnd() {
		dragArtifactIds = [];
		overFolderId = null;
	}
	function onFolderDragEnter(folderId: string) {
		overFolderId = folderId;
	}
	function onFolderDragLeave(folderId: string) {
		if (overFolderId === folderId) overFolderId = null;
	}
	function onFolderDrop(folderId: string) {
		for (const artifactId of dragArtifactIds) void onMoveArtifact(artifactId, folderId);
		dragArtifactIds = [];
		overFolderId = null;
	}
	function getFolderDropState(folderId: string): FolderDropState {
		return { active: dragArtifactIds.length > 0, isOver: overFolderId === folderId };
	}

	// --- Upload ---------------------------------------------------------------------------------------
	let uploadToast = $state<ReturnType<typeof WorkspaceUploadToast> | null>(null);
	let fileInputEl = $state<HTMLInputElement | null>(null);

	function uploadToActiveFolder(fileList: FileList | File[]) {
		const files = [...fileList];
		if (files.length === 0) return;
		uploadToast?.enqueue(files, getUploadTargetFolderId(folderView.activeFolderId) ?? 'root');
	}

	const dropzone = useFileDropzone((files) => uploadToActiveFolder(files));

	function openUploadPicker() {
		fileInputEl?.click();
	}
</script>

<WorkspaceUploadToast bind:this={uploadToast} {onUploadFiles} />

{#snippet controls()}
	<WorkspaceLibraryControls
		query={searchQuery}
		{selectedTypes}
		{sort}
		onQueryChange={onSearchQueryChange}
		{onToggleType}
		{onSortChange}
	/>
{/snippet}

{#snippet toolbar()}
	<WorkspaceBoardToolbar
		barClassName={variant === 'panel' ? panelCardToolbarClass : undefined}
		{workspaceName}
		{workspaceEmoji}
		{titleSlot}
		breadcrumb={folderView.breadcrumb}
		onNavigate={folderNav.navigateTo}
		{onCreateFolder}
		{onCreateDocument}
		{onCreateUrl}
		{onRenameWorkspace}
		{onUpdateWorkspaceEmoji}
		{onArchiveWorkspace}
		{controls}
		onToggleChat={onToggleChatPanel}
		chatOpen={chatPanelOpen}
		{showLeftSidebarTrigger}
		{onToggleLeftSidebar}
		showCreateActions={canCreate}
		{showWorkspaceSettings}
	/>
{/snippet}

{#snippet body()}
	<input
		bind:this={fileInputEl}
		type="file"
		aria-label="Pilih file untuk workspace"
		multiple
		accept={WORKSPACE_UPLOAD_ACCEPT}
		class="sr-only"
		onchange={(event) => {
			if (event.currentTarget.files) uploadToActiveFolder(event.currentTarget.files);
			event.currentTarget.value = '';
		}}
	/>
	<ContextMenu.Root>
		<ContextMenu.Trigger>
			{#snippet child({ props })}
				<div
					{...props}
					{...dropzone.dropzoneProps}
					class={cn(
						'@container relative min-h-0 flex-1 overflow-y-auto bg-background',
						panelBodyPaddingClass,
						'pt-5',
						dropzone.isDragOver && 'bg-muted/25 ring-2 ring-inset ring-primary/30'
					)}
				>
					{#if boardEmpty}
						{#if boardFilteredEmpty}
							<WorkspaceLibraryEmpty
								variant={isRootFolder ? 'root' : 'folder'}
								badgeLabel={activeFolderName}
								badgeEmoji={activeBadgeEmoji}
								title="Tidak ada dokumen yang cocok"
								description="Ubah filter tipe dokumen atau kata kunci untuk melihat item lain."
								showActions={false}
							/>
						{:else}
							<WorkspaceLibraryEmpty
								variant={isRootFolder ? 'root' : 'folder'}
								badgeLabel={activeFolderName}
								badgeEmoji={activeBadgeEmoji}
								{onCreateFolder}
								{onCreateDocument}
								{onCreateUrl}
							/>
						{/if}
					{:else}
						<WorkspaceLibraryGrid
							folders={folderView.folders}
							artifacts={folderView.artifacts}
							{workspaceId}
							workspaces={workspaceMoveTargets}
							{moveTargets}
							draggingArtifactIds={dragArtifactIds}
							{getArtifactSelected}
							{onToggleArtifactContext}
							{onSetArtifactContextSelection}
							onOpenFolder={folderNav.openFolder}
							{onOpenArtifact}
							{onRenameFolder}
							{onDeleteFolder}
							{onMoveFolderToWorkspace}
							{onRenameArtifact}
							{onDeleteArtifact}
							{onAddToCitations}
							{onMoveArtifact}
							{onMoveArtifactToWorkspace}
							{getFolderDropState}
							{onArtifactDragStart}
							{onArtifactDragEnd}
							{onFolderDragEnter}
							{onFolderDragLeave}
							{onFolderDrop}
						/>
					{/if}
				</div>
			{/snippet}
		</ContextMenu.Trigger>
		<ContextMenu.Content class="w-48">
			<ContextMenu.Item onSelect={openUploadPicker}>
				<Icon icon={UploadIcon} class="size-4" />
				Upload file
			</ContextMenu.Item>
			<ContextMenu.Separator />
			<ContextMenu.Item onSelect={onCreateFolder}>
				<Icon icon={FolderIcon} class="size-4" />
				Folder baru
			</ContextMenu.Item>
			{#if DOCUMENT_AUTHORING_ENABLED}
				<!-- Authored blank document — deferred to editor redesign. -->
				<ContextMenu.Item onSelect={onCreateDocument}>
					<Icon icon={FileTextIcon} class="size-4" />
					Dokumen baru
				</ContextMenu.Item>
			{/if}
			<ContextMenu.Item onSelect={onCreateUrl}>
				<Icon icon={LinkIcon} class="size-4" />
				Simpan URL
			</ContextMenu.Item>
		</ContextMenu.Content>
	</ContextMenu.Root>
	{#if showFootnote}
		<WorkspaceLibraryFootnote
			{contextCount}
			onClearContext={() => onSetArtifactContextSelection([])}
		/>
	{/if}
{/snippet}

{#if variant === 'panel'}
	{@render toolbar()}
	{@render body()}
{:else}
	<div class={panelBodyColumnClass}>
		{@render toolbar()}
		{@render body()}
	</div>
{/if}

{@render renderDialogs?.(folderNav.activeFolderId, dialogFolderName, uploadToActiveFolder)}

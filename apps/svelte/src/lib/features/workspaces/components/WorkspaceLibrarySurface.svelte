<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import { useCreateCitationFromArtifact } from '$lib/features/citations/api';
	import type { WorkspaceLibraryData } from '../api/use-workspaces-data';
	import type { WorkspaceLibraryDialogState } from '../hooks/use-workspace-library-dialogs.svelte';
	import {
		defaultWorkspaceArtifactSort,
		workspaceArtifactTypes,
		type WorkspaceArtifactSort,
		type WorkspaceArtifactType
	} from '../utils/workspace-library-model';
	import { uploadWorkspaceFiles } from '../utils/workspace-file-upload';
	import WorkspaceLibraryBoard from './WorkspaceLibraryBoard.svelte';
	import WorkspaceLibraryDialogsStack from './WorkspaceLibraryDialogsStack.svelte';

	/**
	 * Library surface — Svelte port of `workspace-library-surface.tsx`. Owns the search/type/sort URL
	 * state (`?q=&type=&sort=`, history replace — padanan nuqs) and wires the board to `libraryData`
	 * mutations + the dialog stack. `onAddToCitations` bridges paper artifacts into the Citation Manager.
	 */
	const workspaceArtifactSortOptions = [
		'updated-desc',
		'updated-asc',
		'created-desc',
		'created-asc',
		'title-asc',
		'title-desc'
	] as const satisfies readonly WorkspaceArtifactSort[];

	let {
		workspaceId,
		workspaceName,
		titleSlot,
		libraryData,
		dialogState,
		getArtifactSelected,
		onToggleArtifactContext,
		onSetArtifactContextSelection,
		contextCount,
		onAfterArchive,
		showLeftSidebarTrigger,
		onToggleLeftSidebar,
		chatPanelOpen,
		onToggleChatPanel,
		showCreateActions,
		showWorkspaceSettings,
		variant,
		onCitationAdded
	}: {
		workspaceId: string;
		workspaceName: string;
		titleSlot?: Snippet;
		libraryData: WorkspaceLibraryData;
		dialogState: WorkspaceLibraryDialogState;
		getArtifactSelected: (artifactId: string) => boolean;
		onToggleArtifactContext: (artifactId: string) => void;
		onSetArtifactContextSelection: (artifactIds: string[]) => void;
		contextCount?: number;
		onAfterArchive: () => void;
		showLeftSidebarTrigger?: boolean;
		onToggleLeftSidebar?: () => void;
		chatPanelOpen?: boolean;
		onToggleChatPanel?: () => void;
		showCreateActions?: boolean;
		showWorkspaceSettings?: boolean;
		variant?: 'page' | 'panel';
		onCitationAdded?: (citationId: string) => void;
	} = $props();

	const addToCitations = useCreateCitationFromArtifact(() => workspaceId);

	// --- Library controls URL state (q / type[] / sort) -----------------------------------------------
	function dedupeArtifactTypes(types: WorkspaceArtifactType[]) {
		return workspaceArtifactTypes.filter((type) => types.includes(type));
	}
	function parseTypes(raw: string | null): WorkspaceArtifactType[] {
		if (!raw) return [];
		const set = new Set(raw.split(','));
		return workspaceArtifactTypes.filter((type) => set.has(type));
	}
	function parseSort(raw: string | null): WorkspaceArtifactSort {
		return workspaceArtifactSortOptions.includes(raw as WorkspaceArtifactSort)
			? (raw as WorkspaceArtifactSort)
			: defaultWorkspaceArtifactSort;
	}

	const searchQuery = $derived(page.url.searchParams.get('q') ?? '');
	const selectedTypes = $derived(
		dedupeArtifactTypes(parseTypes(page.url.searchParams.get('type')))
	);
	const sortValue = $derived(parseSort(page.url.searchParams.get('sort')));

	function setControls(patch: {
		q?: string;
		type?: WorkspaceArtifactType[];
		sort?: WorkspaceArtifactSort;
	}) {
		const url = new URL(page.url);
		if (patch.q !== undefined) {
			if (patch.q) url.searchParams.set('q', patch.q);
			else url.searchParams.delete('q');
		}
		if (patch.type !== undefined) {
			const value = dedupeArtifactTypes(patch.type);
			if (value.length > 0) url.searchParams.set('type', value.join(','));
			else url.searchParams.delete('type');
		}
		if (patch.sort !== undefined) {
			if (patch.sort !== defaultWorkspaceArtifactSort) url.searchParams.set('sort', patch.sort);
			else url.searchParams.delete('sort');
		}

		void goto(url, { replaceState: true, noScroll: true, keepFocus: true });
	}

	// Stable mutation function references (defined once in `use-workspaces-data`) — capture once.
	const libraryMutations = untrack(() => ({
		archiveWorkspace: libraryData.archiveWorkspace,
		createFolder: libraryData.createFolder,
		createDocument: libraryData.createDocument as (args: {
			workspaceId: string;
			folderId?: string;
			title: string;
		}) => Promise<unknown>,
		createUrl: libraryData.createUrl as (args: {
			workspaceId: string;
			folderId?: string;
			url: string;
			title?: string;
		}) => Promise<unknown>,
		renameFolder: libraryData.renameFolder,
		renameArtifact: libraryData.renameArtifact,
		removeFolder: libraryData.removeFolder,
		removeArtifact: libraryData.removeArtifact
	}));

	const currentWorkspaceName = $derived(libraryData.workspace?.name ?? workspaceName);
	const currentWorkspaceEmoji = $derived(libraryData.workspace?.emoji);
</script>

<WorkspaceLibraryBoard
	workspaceName={currentWorkspaceName}
	workspaceEmoji={currentWorkspaceEmoji}
	{workspaceId}
	{titleSlot}
	folders={libraryData.folders}
	artifacts={libraryData.artifacts}
	{searchQuery}
	{selectedTypes}
	sort={sortValue}
	onSearchQueryChange={(query) => setControls({ q: query })}
	onToggleType={(type) => {
		const current = selectedTypes;
		const next = current.includes(type)
			? current.filter((item) => item !== type)
			: [...current, type];
		setControls({ type: next });
	}}
	onSortChange={(sort) => setControls({ sort })}
	workspaces={libraryData.workspaces}
	onRenameFolder={dialogState.libraryHandlers.onRenameFolder}
	onDeleteFolder={dialogState.libraryHandlers.onDeleteFolder}
	onRenameArtifact={dialogState.libraryHandlers.onRenameArtifact}
	onDeleteArtifact={dialogState.libraryHandlers.onDeleteArtifact}
	onCreateFolder={dialogState.libraryHandlers.onCreateFolder}
	onCreateDocument={dialogState.libraryHandlers.onCreateDocument}
	onCreateUrl={dialogState.libraryHandlers.onCreateUrl}
	onArchiveWorkspace={dialogState.libraryHandlers.onArchiveWorkspace}
	onRenameWorkspace={async (name) => {
		await libraryData.renameWorkspace({ workspaceId, name });
	}}
	onUpdateWorkspaceEmoji={async (emoji) => {
		await libraryData.updateWorkspaceEmoji({ workspaceId, emoji });
	}}
	{getArtifactSelected}
	{onToggleArtifactContext}
	{onSetArtifactContextSelection}
	{contextCount}
	onOpenArtifact={(artifactId) => goto(`/app/workspaces/${workspaceId}/artifacts/${artifactId}`)}
	onAddToCitations={(artifact) =>
		addToCitations.mutate(
			{ artifactId: artifact._id },
			{
				onSuccess: (result) => {
					toast.success(result.created ? 'Ditambahkan ke Sitasi' : 'Sudah ada di Sitasi');
					onCitationAdded?.(result.citation.id);
				}
			}
		)}
	onMoveArtifact={async (artifactId, target) => {
		await libraryData.moveArtifact({
			artifactId,
			folderId: target === 'root' ? undefined : target
		});
	}}
	onMoveArtifactToWorkspace={async (artifactId, targetWorkspaceId) => {
		await libraryData.moveArtifact({ artifactId, targetWorkspaceId });
	}}
	onMoveFolderToWorkspace={async (folderId, targetWorkspaceId) => {
		await libraryData.moveFolder({ folderId, targetWorkspaceId });
	}}
	onUploadFiles={async (files, folderId, options) =>
		uploadWorkspaceFiles({
			files,
			uploadFile: ({ file }) =>
				libraryData.uploadArtifact.mutateAsync({
					file,
					folderId: folderId === 'root' ? undefined : folderId
				}),
			onFileChange: options?.onFileChange
		})}
	{chatPanelOpen}
	{onToggleChatPanel}
	{showLeftSidebarTrigger}
	{onToggleLeftSidebar}
	{showCreateActions}
	{showWorkspaceSettings}
	{variant}
>
	{#snippet renderDialogs(activeFolderId, activeFolderName, onUploadFiles)}
		<WorkspaceLibraryDialogsStack
			{workspaceId}
			{activeFolderId}
			{activeFolderName}
			mutations={libraryMutations}
			{dialogState}
			{onAfterArchive}
			{onUploadFiles}
		/>
	{/snippet}
</WorkspaceLibraryBoard>

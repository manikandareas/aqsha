<script lang="ts">
	import { buildWorkspaceMentionLabel } from '@aqsha/chat-core';
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { SvelteMap } from 'svelte/reactivity';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import DetailSplitLayout from '$lib/components/layout/DetailSplitLayout.svelte';
	import ResponsiveSidePanel from '$lib/components/layout/ResponsiveSidePanel.svelte';
	import AppLoadingOverlay from '$lib/components/layout/AppLoadingOverlay.svelte';
	import { PageTitle } from '$lib/seo';
	import {
		ComposerMentions,
		getComposerMentions,
		panelContextSelection,
		setComposerMentions
	} from '$lib/features/threads/state/composer-mentions.svelte';
	import { useWorkspaceDetailData } from '../api/use-workspaces-data';
	import { WorkspaceLibraryDialogState } from '../hooks/use-workspace-library-dialogs.svelte';
	import { setWorkspacePanel, WorkspacePanelController } from './workspace-panel-context.svelte';
	import WorkspaceLibrarySurface from './WorkspaceLibrarySurface.svelte';
	import WorkspaceSidePanel from './WorkspaceSidePanel.svelte';

	/**
	 * Workspace detail. Provides the per-tree `ComposerMentions` (with the `@Workspace` ambient pill) +
	 * `WorkspacePanelController` (URL `?panel=`), then renders the library surface (main) + the tabbed
	 * `Chat · Sitasi` side panel inside a `DetailSplitLayout`. GOTCHA: the split layout needs a
	 * fixed-height `h-svh` ancestor or its inner `overflow-y-auto` dies — hence the bounded `<main>`.
	 */
	let { workspaceId }: { workspaceId: string } = $props();

	const data = useWorkspaceDetailData(() => workspaceId);

	// Per-tree channels (never module singletons).
	setComposerMentions(new ComposerMentions());
	const mentions = getComposerMentions();
	const panel = setWorkspacePanel(new WorkspacePanelController());
	const dialogState = new WorkspaceLibraryDialogState();

	let panelThreadId = $state<string | null>(null);

	function handlePanelThreadChange(threadId: string | null) {
		panelThreadId = threadId;
		if (threadId !== null) panel.openChat();
	}

	// Auto-mention: the open workspace → an `@Workspace` ambient pill in the panel chat composer.
	$effect(() => {
		const name = data.workspace?.name;
		mentions.syncAmbientFromPage(
			name ? [{ kind: 'workspace', workspaceId, label: buildWorkspaceMentionLabel(name) }] : []
		);
	});

	// Library "click-once = context" selection channel (shared with the composer pins). `titleById`
	// and the workspace name are read fresh per call so labels reflect the loaded workspace.
	const titleById = () => {
		const map = new SvelteMap<string, string>();
		for (const artifact of data.artifacts) map.set(artifact._id, artifact.title);
		return map;
	};
	const contextSelection = untrack(() =>
		panelContextSelection(mentions, {
			workspaceId,
			workspaceName: data.workspace?.name ?? '',
			titleById
		})
	);

	const workspace = $derived(data.workspace);
	// Tab title: the loaded workspace name, else "Workspaces" (loading / not-found).
	const pageTitle = $derived(workspace?.name ?? 'Workspaces');
	const leftSidebar = Sidebar.useSidebar();
	const isLeftSidebarOpen = $derived(
		leftSidebar.isMobile ? leftSidebar.openMobile : leftSidebar.open
	);
</script>

<PageTitle title={pageTitle} />

<main class="flex h-svh min-h-0 flex-col overflow-hidden bg-background">
	{#if data.isLoading}
		<AppLoadingOverlay variant="absolute" />
	{:else if data.workspace === null}
		<div class="grid min-h-svh place-items-center px-4 text-center">
			<div class="grid gap-3">
				<h1 class="font-heading text-2xl font-semibold">Workspace tidak tersedia.</h1>
				<p class="text-[13px] font-medium text-muted-foreground">
					Workspace ini tidak ditemukan untuk akun yang sedang masuk.
				</p>
			</div>
		</div>
	{:else if workspace}
		<DetailSplitLayout sideOpen={panel.isOpen} onSideOpenChange={(open) => panel.setOpen(open)}>
			{#snippet main()}
				<WorkspaceLibrarySurface
					{workspaceId}
					workspaceName={workspace.name}
					libraryData={data}
					{dialogState}
					getArtifactSelected={contextSelection.getArtifactSelected}
					onToggleArtifactContext={contextSelection.onToggleArtifactContext}
					onSetArtifactContextSelection={contextSelection.onSetArtifactContextSelection}
					contextCount={contextSelection.contextCount}
					onAfterArchive={() => goto('/app/workspaces')}
					chatPanelOpen={panel.isOpen}
					onToggleChatPanel={() => panel.setOpen(true)}
					showLeftSidebarTrigger={!isLeftSidebarOpen}
					onToggleLeftSidebar={() => leftSidebar.toggle()}
					onCitationAdded={(citationId) => panel.openCitationDetail(citationId)}
				/>
			{/snippet}
			{#snippet side()}
				<ResponsiveSidePanel open={panel.isOpen}>
					<WorkspaceSidePanel
						{workspaceId}
						activeThreadId={panelThreadId}
						onActiveThreadIdChange={handlePanelThreadChange}
						threads={data.workspaceThreads}
					/>
				</ResponsiveSidePanel>
			{/snippet}
		</DetailSplitLayout>
	{/if}
</main>

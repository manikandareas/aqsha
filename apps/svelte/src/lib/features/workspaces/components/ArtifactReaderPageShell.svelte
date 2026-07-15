<script lang="ts">
	import { buildPaperMentionLabel, type ContextRef } from '@aqsha/chat-core';
	import { PageTitle } from '$lib/seo';
	import DetailSplitLayout from '$lib/components/layout/DetailSplitLayout.svelte';
	import ResponsiveSidePanel from '$lib/components/layout/ResponsiveSidePanel.svelte';
	import {
		ComposerMentions,
		setComposerMentions
	} from '$lib/features/threads/state/composer-mentions.svelte';
	import ExploreChatSidePanel from '$lib/features/explore/components/ExploreChatSidePanel.svelte';
	import { useArtifactDetailData } from '$lib/features/workspaces/api/use-workspaces-data';
	import ArtifactDetailView from './ArtifactDetailView.svelte';

	/**
	 * Standalone artifact reader page shell. Owns the fixed `h-svh` frame (so the reader's inner
	 * `overflow-y-auto` works — see the DetailSplitLayout `h-svh`-ancestor gotcha), fetches the artifact
	 * via `useArtifactDetailData(() => artifactId)`, and passes the data DOWN to `ArtifactDetailView`
	 * (variant="page"). The reader's header carries a "Chat" open toggle.
	 *
	 * The Astra chat panel reuses the Explore chat surface (`ExploreChatSidePanel`) with the current
	 * artifact injected as an ambient `paper` ContextRef via the shared `ComposerMentions` channel — so
	 * sending a message auto-pins the document as context and archives the new thread to its workspace.
	 * The workspace-scoped thread switcher is not used here; `ExploreChatSidePanel` shows the global
	 * thread list. Chat-about-this-artifact works via the ambient ref.
	 */
	let { workspaceId, artifactId }: { workspaceId: string; artifactId: string } = $props();

	const data = useArtifactDetailData(() => artifactId);

	// Shared per-tree channel — publisher (this artifact) + consumer (panel composer).
	const mentions = new ComposerMentions();
	setComposerMentions(mentions);

	const ambientContextRefs = $derived.by<ContextRef[]>(() => {
		const title = data.artifact?.artifact?.title;
		if (!title) return [];
		const workspaceName =
			data.workspaces.find((workspace) => workspace._id === workspaceId)?.name ?? 'Workspace';
		return [
			{
				kind: 'paper',
				workspaceId,
				artifactId,
				label: buildPaperMentionLabel(workspaceName, title)
			}
		];
	});

	$effect(() => {
		mentions.syncAmbientFromPage(ambientContextRefs);
	});

	// Tab title: the loaded artifact title (nested one level under the composite), else "Workspaces".
	const pageTitle = $derived(data.artifact?.artifact?.title ?? 'Workspaces');

	let chatOpen = $state(false);
	let threadId = $state<string | null>(null);

	function handleThreadChange(next: string | null): void {
		threadId = next;
		if (next !== null) chatOpen = true;
	}
</script>

<PageTitle title={pageTitle} />

<main class="flex h-svh min-h-0 flex-col overflow-hidden bg-background">
	<DetailSplitLayout sideOpen={chatOpen} onSideOpenChange={(open) => (chatOpen = open)}>
		{#snippet main()}
			<div class="min-h-0 flex-1 overflow-y-auto">
				<ArtifactDetailView
					{data}
					{artifactId}
					{workspaceId}
					variant="page"
					{chatOpen}
					onToggleChat={() => (chatOpen = !chatOpen)}
				/>
			</div>
		{/snippet}
		{#snippet side()}
			<ResponsiveSidePanel open={chatOpen}>
				<ExploreChatSidePanel
					activeThreadId={threadId}
					onActiveThreadIdChange={handleThreadChange}
					onClose={() => (chatOpen = false)}
				/>
			</ResponsiveSidePanel>
		{/snippet}
	</DetailSplitLayout>
</main>

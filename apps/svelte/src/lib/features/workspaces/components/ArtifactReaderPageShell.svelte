<script lang="ts">
	import DetailSplitLayout from '$lib/components/layout/DetailSplitLayout.svelte';
	import ResponsiveSidePanel from '$lib/components/layout/ResponsiveSidePanel.svelte';
	import SidePanelFrame from '$lib/components/layout/SidePanelFrame.svelte';
	import { Icon, XIcon } from '$lib/icons';
	import { useArtifactDetailData } from '$lib/features/workspaces/api/use-workspaces-data';
	import ArtifactDetailView from './ArtifactDetailView.svelte';

	/**
	 * Standalone artifact reader page shell — Svelte port of
	 * `apps/web/features/workspaces/components/artifact-reader-page-shell.tsx`. Owns the fixed `h-svh`
	 * frame (so the reader's inner `overflow-y-auto` works — see the DetailSplitLayout `h-svh`-ancestor
	 * gotcha), fetches the artifact via `useArtifactDetailData(() => artifactId)`, and passes the data
	 * DOWN to `ArtifactDetailView` (variant="page"). The reader's header carries a "Chat" open toggle.
	 *
	 * SEAM (Phase 9 workspace-chat): web docks a `WorkspaceChatSidePanel` (+ `ComposerMentionsProvider`
	 * ambient artifact token) in the right rail. That surface is not ported yet, so the side panel here
	 * is a documented placeholder — the split layout + toggle wiring are in place for the drop-in.
	 */
	let { workspaceId, artifactId }: { workspaceId: string; artifactId: string } = $props();

	const data = useArtifactDetailData(() => artifactId);

	let chatOpen = $state(false);
</script>

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
				<SidePanelFrame>
					{#snippet header()}
						<div class="flex h-11 items-center justify-between gap-2 px-1">
							<span class="text-[13px] font-semibold text-foreground">Chat Astra</span>
							<button
								type="button"
								data-panel-close
								onclick={() => (chatOpen = false)}
								aria-label="Tutup chat"
								class="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
							>
								<Icon icon={XIcon} class="size-4" />
							</button>
						</div>
					{/snippet}
					<div class="grid place-items-center gap-2 p-6 text-center">
						<p class="text-[13px] font-medium text-muted-foreground">
							Chat Astra tentang artifact ini hadir di fase berikutnya.
						</p>
					</div>
				</SidePanelFrame>
			</ResponsiveSidePanel>
		{/snippet}
	</DetailSplitLayout>
</main>

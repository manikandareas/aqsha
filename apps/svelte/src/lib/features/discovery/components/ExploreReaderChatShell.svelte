<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import type { ContextRef } from '@aqsha/chat-core';
	import DetailSplitLayout from '$lib/components/layout/DetailSplitLayout.svelte';
	import ResponsiveSidePanel from '$lib/components/layout/ResponsiveSidePanel.svelte';
	import PanelOpenButton from '$lib/components/layout/PanelOpenButton.svelte';
	import { Icon, ChevronRightIcon, MessageSquareIcon } from '$lib/icons';
	import { panelHeaderBarClass } from '$lib/components/layout/panel-surface';
	import {
		ComposerMentions,
		setComposerMentions
	} from '$lib/features/threads/state/composer-mentions.svelte';
	import ExploreChatSidePanel from '$lib/features/explore/components/ExploreChatSidePanel.svelte';

	/**
	 * Chat shell for the Explore reader pages (paper & news). Wraps the reader with the Astra chat panel
	 * (DetailSplitLayout + ExploreChatSidePanel, workspace-less) — mirror of ExplorePage. The page context
	 * token (paper/news) flows into the composer via the shared `ComposerMentions` (`syncAmbientFromPage`)
	 * so it auto-pins as a pill when the panel opens. The reader's "Tanya Astra" button calls `openChat`
	 * (children render-prop) → opens the panel, NOT a seed navigation. Port of `explore-reader-chat-shell.tsx`.
	 */
	let {
		breadcrumb,
		ambientContextRefs,
		children
	}: {
		breadcrumb: string;
		ambientContextRefs: ContextRef[];
		children: Snippet<[{ openChat: () => void }]>;
	} = $props();

	// Shared per-tree channel (§3.5) — publisher (page context) + consumer (panel composer).
	const mentions = new ComposerMentions();
	setComposerMentions(mentions);

	// Sync the page's ambient token into the composer as reader data arrives (guarded by signature).
	$effect(() => {
		mentions.syncAmbientFromPage(ambientContextRefs);
	});

	let chatOpen = $state(false);
	let threadId = $state<string | null>(null);

	function handleThreadChange(next: string | null): void {
		threadId = next;
		if (next !== null) chatOpen = true;
	}
</script>

<main class="flex h-svh min-h-0 flex-col overflow-hidden bg-background">
	<DetailSplitLayout sideOpen={chatOpen} onSideOpenChange={(open) => (chatOpen = open)}>
		{#snippet main()}
			<div class="min-h-0 flex-1 overflow-y-auto">
				<header class={panelHeaderBarClass}>
					<nav aria-label="Breadcrumb" class="flex min-w-0 items-center gap-1.5 text-[13px]">
						<a
							href={resolve('/app/(product)/explore')}
							class="shrink-0 truncate rounded-md font-medium text-muted-foreground transition-colors hover:text-foreground"
						>
							Jelajahi
						</a>
						<Icon icon={ChevronRightIcon} class="size-3.5 shrink-0 text-muted-foreground/60" />
						<span class="min-w-0 truncate font-medium text-foreground">{breadcrumb}</span>
					</nav>
					<PanelOpenButton
						open={chatOpen}
						onOpen={() => (chatOpen = !chatOpen)}
						label="Chat"
						ariaLabel="Buka panel chat"
					>
						{#snippet icon()}
							<Icon icon={MessageSquareIcon} class="size-3.5" />
						{/snippet}
					</PanelOpenButton>
				</header>
				{@render children({ openChat: () => (chatOpen = true) })}
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

<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import DetailSplitLayout from '$lib/components/layout/DetailSplitLayout.svelte';
	import ResponsiveSidePanel from '$lib/components/layout/ResponsiveSidePanel.svelte';
	import PanelOpenButton from '$lib/components/layout/PanelOpenButton.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Icon, ChevronRightIcon, MessageSquareIcon, PanelLeftIcon } from '$lib/icons';
	import { cn } from '$lib/utils';
	import { panelHeaderBarClass } from '$lib/components/layout/panel-surface';
	import {
		ComposerMentions,
		setComposerMentions
	} from '$lib/features/threads/state/composer-mentions.svelte';
	import { FEED_TOPIC_LABELS, type FeedTopic } from '$lib/features/discovery/types';
	import { applyExploreUrl, readExploreUrl } from '../explore-url-model';
	import ExploreHero from './ExploreHero.svelte';
	import ExploreFindings from './ExploreFindings.svelte';
	import ExploreChatSidePanel from './ExploreChatSidePanel.svelte';

	/**
	 * Explore surface — paper + news discovery. Sticky glass header (breadcrumb left + Chat toggle right)
	 * over the scrolling feed. Empty `q` → personal/topic feed (Jelajah); non-empty `q` → search results
	 * (Selidiki). Opening Chat splits into `DetailSplitLayout` with a workspace-less Astra panel. `q` +
	 * `topic` live in the URL (pure codec + `page.url`/`goto`).
	 */

	// Left-nav sidebar (AppShell provider) — read at init, before DetailSplitLayout opens its own provider.
	const leftSidebar = Sidebar.useSidebar();

	// Per-tree composer mentions — shared by the feed cards (publisher) + the chat panel composer
	// (consumer), so "Tanya Astra" ambient refs reach the composer as a pill.
	const mentions = new ComposerMentions();
	setComposerMentions(mentions);

	// URL state (q/topic) — single source of truth.
	const urlState = $derived(readExploreUrl(page.url.searchParams));
	const q = $derived(urlState.q);
	const topic = $derived<FeedTopic | null>(urlState.topic);
	const investigate = $derived(q.trim().length >= 2);

	let chatOpen = $state(false);
	let threadId = $state<string | null>(null);

	function navigate(patch: Partial<{ q: string; topic: FeedTopic | null }>): void {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient URL builder, not reactive state
		const url = new URL(page.url);
		url.search = applyExploreUrl(url.searchParams, patch).toString();
		// Replace history entry — same-page URL patch; resolve() can't model an edited search param.
		void goto(url, { replaceState: true, noScroll: true, keepFocus: true });
	}

	const setTopic = (next: FeedTopic | null) => navigate({ topic: next });
	const submitQuery = (next: string) => navigate({ q: next.trim() ? next.trim() : '' });

	const isLeftSidebarOpen = $derived(
		leftSidebar.isMobile ? leftSidebar.openMobile : leftSidebar.open
	);
	const topicLabel = $derived(topic ? FEED_TOPIC_LABELS[topic] : null);

	function handleThreadChange(next: string | null): void {
		threadId = next;
		if (next !== null) chatOpen = true;
	}
</script>

<main class="flex h-svh min-h-0 flex-col overflow-hidden bg-background">
	<DetailSplitLayout sideOpen={chatOpen} onSideOpenChange={(open) => (chatOpen = open)}>
		{#snippet main()}
			<div class="@container/explore min-h-0 flex-1 overflow-y-auto">
				<header class={panelHeaderBarClass}>
					<nav aria-label="Breadcrumb" class="flex min-w-0 items-center gap-1.5 text-[13px]">
						{#if !isLeftSidebarOpen}
							<Button
								type="button"
								variant="ghost"
								class="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
								onclick={() => leftSidebar.toggle()}
								aria-label="Buka sidebar kiri"
							>
								<Icon icon={PanelLeftIcon} class="size-3.5" />
							</Button>
						{/if}
						<button
							type="button"
							onclick={() => setTopic(null)}
							class={cn(
								'shrink-0 truncate rounded-md font-medium transition-colors',
								topicLabel ? 'text-muted-foreground hover:text-foreground' : 'text-foreground'
							)}
						>
							Jelajahi
						</button>
						{#if topicLabel}
							<Icon icon={ChevronRightIcon} class="size-3.5 shrink-0 text-muted-foreground/60" />
							<span class="min-w-0 truncate font-medium text-foreground">{topicLabel}</span>
						{/if}
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

				<div class="mx-auto w-full max-w-[1180px] px-6 pb-24 @2xl:px-7">
					<ExploreHero
						activeTopic={topic}
						onSelectTopic={setTopic}
						query={q}
						onSubmitQuery={submitQuery}
						compact={investigate}
					/>
					<ExploreFindings {topic} query={q} onOpenChat={() => (chatOpen = true)} />
				</div>
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

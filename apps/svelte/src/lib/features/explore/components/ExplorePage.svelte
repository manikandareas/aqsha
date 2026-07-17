<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Icon, ChevronRightIcon, PanelLeftIcon } from '$lib/icons';
	import { cn } from '@aqsha/ui-svelte/utils';
	import { panelHeaderBarClass } from '$lib/components/layout/panel-surface';
	import { FEED_TOPIC_LABELS, type FeedTopic } from '$lib/features/discovery/types';
	import { applyExploreUrl, readExploreUrl } from '../explore-url-model';
	import ExploreHero from './ExploreHero.svelte';
	import ExploreFindings from './ExploreFindings.svelte';

	/**
	 * Explore surface — paper + news discovery. Sticky glass header (breadcrumb + left-sidebar toggle) over
	 * the scrolling feed. Empty `q` → personal/topic feed (Jelajah); non-empty `q` → search results
	 * (Selidiki). `q` + `topic` live in the URL (pure codec + `page.url`/`goto`). Browse-only: the research
	 * chat lives inside a project now, so there is no embedded Astra panel here.
	 */

	// Left-nav sidebar (AppShell provider).
	const leftSidebar = Sidebar.useSidebar();

	// URL state (q/topic) — single source of truth.
	const urlState = $derived(readExploreUrl(page.url.searchParams));
	const q = $derived(urlState.q);
	const topic = $derived<FeedTopic | null>(urlState.topic);
	const investigate = $derived(q.trim().length >= 2);

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
</script>

<main class="flex h-svh min-h-0 flex-col overflow-hidden bg-background">
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
		</header>

		<div class="mx-auto w-full max-w-[1180px] px-6 pb-24 @2xl:px-7">
			<ExploreHero
				activeTopic={topic}
				onSelectTopic={setTopic}
				query={q}
				onSubmitQuery={submitQuery}
				compact={investigate}
			/>
			<ExploreFindings {topic} query={q} />
		</div>
	</div>
</main>

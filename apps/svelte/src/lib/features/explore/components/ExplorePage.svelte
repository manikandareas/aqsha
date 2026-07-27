<script lang="ts">
	import { untrack } from 'svelte';
	import { replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { SvelteURL } from 'svelte/reactivity';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Icon, ChevronRightIcon, FilterIcon } from '$lib/icons';
	import { cn } from '@aqsha/ui-svelte/utils';
	import { getAuthState } from '$lib/auth';
	import { readableApiErrorMessage } from '$lib/errors';
	import AppPageHeader from '$lib/components/layout/AppPageHeader.svelte';
	import DetailSplitLayout from '$lib/components/layout/DetailSplitLayout.svelte';
	import { PanelInline } from '$lib/hooks/panel-inline.svelte';
	import { DeferredQueryRegion, type DeferredQueryResult } from '$lib/query';
	import { FEED_TOPIC_LABELS, type FeedTopic } from '$lib/features/discovery/types';
	import { useLiteratureSearch } from '$lib/features/discovery/api';
	import { applyExploreUrl, readExploreUrl } from '../explore-url-model';
	import { writeFilterPanelCookie } from '../filter-panel-state';
	import { useLiteratureCatalog } from '../api';
	import {
		LiteratureSearchDraft,
		appliedLiteratureSignature,
		type AppliedLiteratureSearchState
	} from '../literature-search-state.svelte';
	import type {
		LiteratureFilterCategoryId,
		LiteratureFilterClause,
		LiteratureFilterDefinition,
		LiteratureSortId
	} from '../literature-search-types';
	import ExploreFindings from './ExploreFindings.svelte';
	import ExploreFeedSkeleton from './ExploreFeedSkeleton.svelte';
	import LiteratureSearchBar from './LiteratureSearchBar.svelte';
	import LiteratureSearchSuggestions from './LiteratureSearchSuggestions.svelte';
	import LiteratureFilterPanel from './LiteratureFilterPanel.svelte';
	import LiteratureResults from './LiteratureResults.svelte';
	import LiteratureResultsSkeleton from './LiteratureResultsSkeleton.svelte';

	/**
	 * Explore surface — paper-first literature search. A breadcrumb header plus a query bar sit over
	 * a scrolling body; the query bar is always present, so empty `q` and non-empty `q` share the same
	 * chrome. Empty `q` → curated feed (Jelajah) with a page-owned title and search suggestions;
	 * non-empty `q` → direct OpenAlex literature search with a dense result list. Filters live in a
	 * right column that docks beside the results on wide viewports and drops to a bottom drawer
	 * below the panel-inline breakpoint. `q`/`sort`/`f`/`topic` live in the URL via shallow
	 * `replaceState`, never a full navigation. `topic` only drives the curated feed and is kept for
	 * legacy links/breadcrumb.
	 */
	let {
		feedResult,
		initialFilterPanelOpen = false
	}: {
		feedResult: Promise<DeferredQueryResult>;
		/** Restored from the `explore_filters_state` cookie by the page load. */
		initialFilterPanelOpen?: boolean;
	} = $props();

	const EMPTY_CATALOG: {
		categories: Array<{ id: LiteratureFilterCategoryId; label: string }>;
		filters: LiteratureFilterDefinition[];
	} = { categories: [], filters: [] };

	const EXPLORE_CONTENT_CLASS = 'mx-auto w-full max-w-6xl px-4 sm:px-5 @2xl/explore:px-6';
	const EXPLORE_SECTION_CLASS = 'pt-6 sm:pt-8';
	const EXPLORE_ERROR_CLASS =
		'rounded-lg border-2 border-destructive/25 bg-destructive/10 px-4 py-3';

	// `replaceState` changes browser history but intentionally leaves `$app/state.page.url` untouched.
	// Keep the rendered state in sync eagerly, then restore it from the browser on Back/Forward.
	let applied = $state<AppliedLiteratureSearchState>(
		untrack(() => readExploreUrl(page.url.searchParams))
	);
	const literatureMode = $derived(applied.q.trim().length > 0);
	const topic = $derived<FeedTopic | null>(applied.topic);
	const topicLabel = $derived(topic ? FEED_TOPIC_LABELS[topic] : null);

	// One draft per page instance. Typing/filter edits only ever touch this — URL writes happen
	// through `commitApplied`, called from query submit and filter Apply alike.
	const draft = new LiteratureSearchDraft(untrack(() => applied));

	// Guarded resync: Back/Forward (or any external URL change) resets the draft to match; our own
	// commits land here too, but since they originate from `draft.snapshot()` the reset is a no-op.
	let lastAppliedSignature = untrack(() => appliedLiteratureSignature(applied));
	$effect(() => {
		const signature = appliedLiteratureSignature(applied);
		if (signature !== lastAppliedSignature) {
			lastAppliedSignature = signature;
			draft.reset(applied);
		}
	});

	const auth = getAuthState();
	const authReady = () => auth.isSignedIn;
	const catalogQuery = useLiteratureCatalog(authReady);
	const catalog = $derived(catalogQuery.data ?? EMPTY_CATALOG);

	const searchQuery = useLiteratureSearch(
		() => applied,
		() => authReady() && literatureMode
	);

	// The stored preference describes the docked rail. `PanelInline` reports the real match as soon
	// as it runs in the browser (its `true` is only an SSR fallback), so a narrow client starts
	// closed rather than unfurling a bottom sheet over the page on load.
	const panelInline = new PanelInline();
	let filterPanelOpen = $state(untrack(() => initialFilterPanelOpen && panelInline.current));

	function setFilterPanelOpen(next: boolean): void {
		filterPanelOpen = next;
		// Only persist the docked state — a drawer open is a momentary action, not a preference.
		if (panelInline.current) writeFilterPanelCookie(next);
	}

	function syncAppliedFromLocation(): void {
		applied = readExploreUrl(new SvelteURL(window.location.href).searchParams);
	}

	function commitApplied(snapshot: AppliedLiteratureSearchState): void {
		applied = snapshot;
		const url = new SvelteURL(window.location.href);
		url.search = applyExploreUrl(url.searchParams, {
			q: snapshot.q,
			sort: snapshot.sort,
			filters: snapshot.filters,
			topic: snapshot.topic
		}).toString();
		replaceState(resolve('/app/(product)/explore') + url.search + url.hash, page.state);
	}

	function setTopic(next: FeedTopic | null): void {
		draft.topic = next;
		commitApplied({ ...applied, topic: next });
	}

	function handleQueryChange(query: string): void {
		draft.setQuery(query);
	}

	function handleSuggestionSelect(filterValue: string, filter: LiteratureFilterClause): void {
		draft.setQuery(filterValue);
		draft.replaceClause(filter);
		commitApplied(draft.snapshot());
	}

	// Submit AND Apply both snapshot the draft, so filters staged before a new query is submitted
	// are kept rather than dropped.
	function handleSubmitQuery(): void {
		commitApplied(draft.snapshot());
	}

	function handleFilterChange(patch: { filters: LiteratureFilterClause[] }): void {
		draft.filters = patch.filters;
	}

	// Applying does not close the docked rail — the results reflow beside it, so there is nothing to
	// get out of the way of. The panel closes itself after Apply only in its drawer form.
	function handleFilterApply(): void {
		commitApplied(draft.snapshot());
	}

	function handleFilterReset(): void {
		draft.clearFilters();
	}

	function handleFilterDiscard(): void {
		draft.reset(applied);
	}

	// Closing the panel any way other than Apply (X, drawer dismiss, sidebar shortcut) rolls the
	// staged draft back, so an abandoned edit can never ride along on the next query submit.
	function closeFilterPanel(): void {
		if (filterPanelOpen) handleFilterDiscard();
		setFilterPanelOpen(false);
	}

	function toggleFilterPanel(): void {
		if (filterPanelOpen) closeFilterPanel();
		else setFilterPanelOpen(true);
	}

	// Sort is a direct toolbar control, not gated by Apply — commit it against the currently applied
	// filters so an unrelated, unapplied filter edit in the panel is never silently activated.
	function handleSortChange(sort: LiteratureSortId): void {
		draft.setSort(sort);
		commitApplied({ ...applied, sort });
	}

	// "Hapus semua filter" on the empty-result state acts immediately — unlike the Filter Builder's
	// own Reset, it does not wait for a second Apply click.
	function handleClearFilters(): void {
		draft.clearFilters();
		commitApplied(draft.snapshot());
	}

	function handleLoadMore(): void {
		void searchQuery.fetchNextPage();
	}
</script>

<svelte:window onpopstate={syncAppliedFromLocation} />

<!--
	Bounded-height root. `DetailSplitLayout` and everything under it size from `flex-1`/`min-h-0`
	with no fixed height, so without this `h-svh` ancestor the chain is content-driven and the
	body scrolls instead of the results column.
-->
<div class="flex h-svh min-h-0 min-w-0 flex-col overflow-hidden bg-background">
	<!--
		Narrower than the default detail track: this column holds controls, not reading content, so
		it sits closer to the nav rail's width and leaves the result list its full measure.
	-->
	<DetailSplitLayout
		sideOpen={filterPanelOpen}
		sideVariant="rail"
		sideWidth="clamp(20rem,24vw,24rem)"
		onSideOpenChange={(open) => {
			if (!open) closeFilterPanel();
		}}
	>
		{#snippet main()}
			<div class="@container/explore min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
				<AppPageHeader class="border-b-0">
					{#snippet title()}
						<nav aria-label="Breadcrumb" class="flex min-w-0 items-center gap-1.5">
							<button
								type="button"
								onclick={() => setTopic(null)}
								class={cn(
									'inline-flex h-11 min-w-0 items-center truncate rounded-md px-1 text-base font-semibold transition-colors',
									topicLabel ? 'text-muted-foreground hover:text-foreground' : 'text-foreground'
								)}
								aria-current={topicLabel ? undefined : 'page'}
							>
								Jelajahi
							</button>
							{#if topicLabel}
								<Icon icon={ChevronRightIcon} class="size-3.5 shrink-0 text-muted-foreground/60" />
								<span
									aria-current="page"
									class="min-w-0 truncate text-base font-semibold text-foreground"
									>{topicLabel}</span
								>
							{/if}
						</nav>
					{/snippet}
					{#snippet actions()}
						<!-- Mirrors the nav-rail trigger on the left of this same bar. -->
						<button
							type="button"
							onclick={toggleFilterPanel}
							aria-pressed={filterPanelOpen}
							aria-label={filterPanelOpen ? 'Tutup panel filter' : 'Buka panel filter'}
							class={cn(
								'relative flex size-7 shrink-0 items-center justify-center rounded-full transition-colors',
								filterPanelOpen
									? 'bg-muted text-foreground'
									: 'text-muted-foreground hover:bg-muted hover:text-foreground'
							)}
						>
							<Icon icon={FilterIcon} class="size-3.5" />
							{#if applied.filters.length > 0}
								<span
									aria-hidden="true"
									class="absolute top-1 right-1 size-1.5 rounded-full bg-primary"
								></span>
							{/if}
						</button>
					{/snippet}
				</AppPageHeader>

				<div class={cn(EXPLORE_CONTENT_CLASS, 'py-3 sm:py-4')}>
					<header>
						<h1
							class="font-heading text-balance text-[28px] leading-tight font-bold text-foreground sm:text-3xl md:text-4xl"
						>
							Cari literatur
							<span class="explore-search-emoji ml-2 inline-block" aria-hidden="true">🔎</span>
						</h1>
					</header>
				</div>

				<div class={cn(EXPLORE_CONTENT_CLASS, 'py-2 sm:py-3')}>
					<div class="w-full space-y-6 sm:space-y-8">
						<LiteratureSearchBar
							compact
							value={draft.q}
							filtersOpen={filterPanelOpen}
							activeFilterCount={applied.filters.length}
							onValueChange={handleQueryChange}
							onSubmit={handleSubmitQuery}
							onToggleFilters={toggleFilterPanel}
						/>
						{#if !literatureMode}
							<LiteratureSearchSuggestions onSelect={handleSuggestionSelect} />
						{/if}
					</div>
				</div>

				<!-- Bottom room for the floating batch bar, which wraps to two lines on phone widths. -->
				<div class={cn(EXPLORE_CONTENT_CLASS, 'pb-28 sm:pb-24')}>
					{#if literatureMode}
						<section class={EXPLORE_SECTION_CLASS}>
							<DeferredQueryRegion result={feedResult} dependency="app:explore-feed">
								{#snippet pending()}
									<LiteratureResultsSkeleton />
								{/snippet}
								{#snippet failed(error, retry)}
									<div class={EXPLORE_ERROR_CLASS}>
										<p class="text-label font-medium text-destructive">
											{readableApiErrorMessage(error, 'Hasil belum dapat dimuat.')}
										</p>
										<Button type="button" variant="outline" size="sm" class="mt-3" onclick={retry}>
											Coba lagi
										</Button>
									</div>
								{/snippet}
								<LiteratureResults
									query={searchQuery}
									{applied}
									onSortChange={handleSortChange}
									onClearFilters={handleClearFilters}
									onLoadMore={handleLoadMore}
								/>
							</DeferredQueryRegion>
						</section>
					{:else}
						<DeferredQueryRegion result={feedResult} dependency="app:explore-feed">
							{#snippet pending()}
								<section class={EXPLORE_SECTION_CLASS}><ExploreFeedSkeleton /></section>
							{/snippet}
							{#snippet failed(error, retry)}
								<section class={EXPLORE_SECTION_CLASS}>
									<div class={EXPLORE_ERROR_CLASS}>
										<p class="text-label font-medium text-destructive">
											{readableApiErrorMessage(error, 'Temuan belum dapat dimuat.')}
										</p>
										<Button type="button" variant="outline" size="sm" class="mt-3" onclick={retry}>
											Coba lagi
										</Button>
									</div>
								</section>
							{/snippet}
							<ExploreFindings {topic} />
						</DeferredQueryRegion>
					{/if}
				</div>
			</div>
		{/snippet}

		{#snippet side()}
			<LiteratureFilterPanel
				open={filterPanelOpen}
				{catalog}
				{draft}
				activeCount={applied.filters.length}
				onChange={handleFilterChange}
				onApply={handleFilterApply}
				onReset={handleFilterReset}
				onClose={closeFilterPanel}
			/>
		{/snippet}
	</DetailSplitLayout>
</div>

<style>
	.explore-search-emoji {
		transform-origin: 70% 80%;
		animation: explore-search-idle 5s ease-in-out infinite;
	}

	@keyframes explore-search-idle {
		0%,
		54%,
		100% {
			transform: rotate(-8deg) translateY(0);
		}

		8%,
		24% {
			transform: rotate(7deg) translateY(-2px);
		}

		16% {
			transform: rotate(-4deg) translateY(0);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.explore-search-emoji {
			animation: none;
		}
	}
</style>

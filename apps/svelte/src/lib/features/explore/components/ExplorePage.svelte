<script lang="ts">
	import { untrack } from 'svelte';
	import { replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { SvelteURL } from 'svelte/reactivity';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Skeleton } from '@aqsha/ui-svelte/components/skeleton';
	import { Icon, ChevronRightIcon } from '$lib/icons';
	import { cn } from '@aqsha/ui-svelte/utils';
	import { getAuthState } from '$lib/auth';
	import { readableApiErrorMessage } from '$lib/errors';
	import { IsMobile } from '$lib/hooks/is-mobile.svelte';
	import AppPageHeader from '$lib/components/layout/AppPageHeader.svelte';
	import { DeferredQueryRegion, type DeferredQueryResult } from '$lib/query';
	import { FEED_TOPIC_LABELS, type FeedTopic } from '$lib/features/discovery/types';
	import { useLiteratureSearch } from '$lib/features/discovery/api';
	import { applyExploreUrl, readExploreUrl } from '../explore-url-model';
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
	import LiteratureFilterDrawer from './LiteratureFilterDrawer.svelte';
	import LiteratureFilterSheet from './LiteratureFilterSheet.svelte';
	import LiteratureResults from './LiteratureResults.svelte';

	/**
	 * Explore surface — paper-first literature search. A breadcrumb header plus a query bar sit over
	 * a scrolling body; the query bar is always present, so empty `q` and non-empty `q` share the same
	 * chrome. Empty `q` → curated feed (Jelajah) with a page-owned title and search suggestions;
	 * non-empty `q` → direct OpenAlex literature search with a dense result list. Filters open in a
	 * side sheet on desktop or a drawer on mobile. `q`/`sort`/`f`/`topic` live in the
	 * URL via shallow `replaceState`, never a full navigation. `topic` only drives the curated feed
	 * and is kept for legacy links/breadcrumb.
	 */
	let { feedResult }: { feedResult: Promise<DeferredQueryResult> } = $props();

	const EMPTY_CATALOG: {
		categories: Array<{ id: LiteratureFilterCategoryId; label: string }>;
		filters: LiteratureFilterDefinition[];
	} = { categories: [], filters: [] };

	const EXPLORE_CONTENT_CLASS = 'mx-auto w-full max-w-6xl px-5 @2xl/explore:px-6';
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

	let filterDrawerOpen = $state(false);
	let filterSheetOpen = $state(false);
	const isMobile = new IsMobile(1024);

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

	function handleFilterApply(): void {
		commitApplied(draft.snapshot());
		filterDrawerOpen = false;
		filterSheetOpen = false;
	}

	function handleFilterReset(): void {
		draft.clearFilters();
	}

	function handleFilterDiscard(): void {
		draft.reset(applied);
	}

	// Sort is a direct toolbar control, not gated by Apply — commit it against the currently applied
	// filters so an unrelated, unapplied filter edit in the sheet or drawer is never silently activated.
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

	// Use a bottom drawer on touch layouts and a side sheet on wider screens so the results keep
	// their full reading width without a persistent filter column.
	function handleOpenFiltersInResults(): void {
		if (isMobile.current) {
			filterDrawerOpen = true;
			return;
		}
		filterSheetOpen = true;
	}

	function handleLoadMore(): void {
		void searchQuery.fetchNextPage();
	}
</script>

<svelte:window onpopstate={syncAppliedFromLocation} />

<main class="flex h-svh min-h-0 flex-col overflow-hidden bg-background">
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
							class="min-w-0 truncate text-base font-semibold text-foreground">{topicLabel}</span
						>
					{/if}
				</nav>
			{/snippet}
		</AppPageHeader>

		<div class={cn(EXPLORE_CONTENT_CLASS, 'py-4')}>
			<header>
				<h1
					class="font-heading text-balance text-3xl leading-tight font-bold text-foreground sm:text-4xl"
				>
					Cari literatur
					<span class="explore-search-emoji ml-2 inline-block" aria-hidden="true">🔎</span>
				</h1>
			</header>
		</div>

		<div class={cn(EXPLORE_CONTENT_CLASS, 'py-2 sm:py-3')}>
			<div class="w-full space-y-8">
				<LiteratureSearchBar
					compact
					value={draft.q}
					onValueChange={handleQueryChange}
					onSubmit={handleSubmitQuery}
					onOpenFilters={handleOpenFiltersInResults}
				/>
				{#if !literatureMode}
					<LiteratureSearchSuggestions onSelect={handleSuggestionSelect} />
				{/if}
			</div>
		</div>

		<div class={cn(EXPLORE_CONTENT_CLASS, 'pb-20 sm:pb-24')}>
			{#if literatureMode}
				<section class={EXPLORE_SECTION_CLASS}>
					<DeferredQueryRegion result={feedResult} dependency="app:explore-feed">
						{#snippet pending()}
							{@render literatureResultsSkeleton()}
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

		<LiteratureFilterDrawer
			{catalog}
			{draft}
			onChange={handleFilterChange}
			onApply={handleFilterApply}
			onReset={handleFilterReset}
			onDiscard={handleFilterDiscard}
			bind:open={filterDrawerOpen}
		/>
		<LiteratureFilterSheet
			{catalog}
			{draft}
			onChange={handleFilterChange}
			onApply={handleFilterApply}
			onReset={handleFilterReset}
			onDiscard={handleFilterDiscard}
			bind:open={filterSheetOpen}
		/>
	</div>
</main>

{#snippet literatureResultsSkeleton()}
	<div class="flex flex-col gap-4">
		<div class="flex items-center justify-between gap-3">
			<Skeleton class="h-4 w-24" />
			<Skeleton class="h-8 w-40" />
		</div>
		<div
			class="divide-y divide-border/80 overflow-hidden rounded-lg border-2 border-border bg-card"
		>
			{#each ['a', 'b', 'c', 'd', 'e'] as key (key)}
				<div class="flex gap-3 px-4 py-5 sm:px-5">
					<Skeleton class="mt-0.5 size-5 shrink-0 rounded-sm" />
					<div class="min-w-0 flex-1 space-y-2">
						<Skeleton class="h-4 w-[70%]" />
						<Skeleton class="h-3 w-[45%]" />
						<Skeleton class="h-3 w-full" />
					</div>
				</div>
			{/each}
		</div>
	</div>
{/snippet}

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

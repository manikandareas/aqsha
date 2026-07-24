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
	import LiteratureSearchHero from './LiteratureSearchHero.svelte';
	import LiteratureSearchBar from './LiteratureSearchBar.svelte';
	import LiteratureFilterSidebar from './LiteratureFilterSidebar.svelte';
	import LiteratureFilterDrawer from './LiteratureFilterDrawer.svelte';
	import LiteratureResults from './LiteratureResults.svelte';

	/**
	 * Explore surface — paper-first literature search. Sticky page header (breadcrumb + left-nav
	 * toggle) over a scrolling body. Empty `q` → curated feed (Jelajah) under a centered search hero;
	 * non-empty `q` → direct OpenAlex literature search with a compact bar, filter sidebar/drawer, and
	 * a dense result list. `q`/`sort`/`f`/`topic` live in the URL via shallow `replaceState`, never a
	 * full navigation. `topic` only drives the curated feed and is kept for legacy links/breadcrumb.
	 */
	let { feedResult }: { feedResult: Promise<DeferredQueryResult> } = $props();

	const EMPTY_CATALOG: {
		categories: Array<{ id: LiteratureFilterCategoryId; label: string }>;
		filters: LiteratureFilterDefinition[];
	} = { categories: [], filters: [] };

	// Applied state (URL) — single source of truth for what is actually searched/shown.
	const applied = $derived<AppliedLiteratureSearchState>(readExploreUrl(page.url.searchParams));
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
	const isMobile = new IsMobile(1024);

	function commitApplied(snapshot: AppliedLiteratureSearchState): void {
		const url = new SvelteURL(page.url);
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
		const url = new SvelteURL(page.url);
		url.search = applyExploreUrl(url.searchParams, { topic: next }).toString();
		replaceState(resolve('/app/(product)/explore') + url.search + url.hash, page.state);
	}

	function handleQueryChange(query: string): void {
		draft.setQuery(query);
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
	}

	function handleFilterReset(): void {
		draft.clearFilters();
	}

	function handleFilterDiscard(): void {
		draft.reset(applied);
	}

	// Sort is a direct toolbar control, not gated by Apply — commit it against the currently applied
	// filters so an unrelated, unapplied filter edit in the sidebar is never silently activated.
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

	// The Filter control is mobile-only; desktop keeps this focus handoff for keyboard callers.
	function handleOpenFiltersInResults(): void {
		if (isMobile.current) {
			filterDrawerOpen = true;
			return;
		}
		const sidebar = document.getElementById('advanced-search');
		const focusable = sidebar?.querySelector<HTMLElement>(
			'button, [href], input, select, textarea, [tabindex]'
		);
		focusable?.focus();
	}

	function handleLoadMore(): void {
		void searchQuery.fetchNextPage();
	}
</script>

<main class="flex h-svh min-h-0 flex-col overflow-hidden bg-background">
	<div class="@container/explore min-h-0 flex-1 overflow-y-auto">
		<AppPageHeader class="border-b-0">
			{#snippet title()}
				<nav aria-label="Breadcrumb" class="flex min-w-0 items-center gap-1.5">
					<button
						type="button"
						onclick={() => setTopic(null)}
						class={cn(
							'shrink-0 truncate rounded-md text-base font-semibold transition-colors',
							topicLabel ? 'text-muted-foreground hover:text-foreground' : 'text-foreground'
						)}
					>
						Jelajahi
					</button>
					{#if topicLabel}
						<Icon icon={ChevronRightIcon} class="size-3.5 shrink-0 text-muted-foreground/60" />
						<span class="min-w-0 truncate text-base font-semibold text-foreground"
							>{topicLabel}</span
						>
					{/if}
				</nav>
			{/snippet}
		</AppPageHeader>

		<div class="mx-auto w-full max-w-[1240px] px-5 pb-24 @2xl/explore:px-7">
			<div class="grid min-w-0 gap-6 pt-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
				<LiteratureFilterSidebar
					{catalog}
					{draft}
					onChange={handleFilterChange}
					onApply={handleFilterApply}
					onReset={handleFilterReset}
				/>
				<div class="min-w-0">
					{#if literatureMode}
						<section class="pt-0">
							<div class="mb-5 max-w-[720px]">
								<LiteratureSearchBar
									compact
									value={draft.q}
									onValueChange={handleQueryChange}
									onSubmit={handleSubmitQuery}
									onOpenFilters={handleOpenFiltersInResults}
								/>
							</div>
							<DeferredQueryRegion result={feedResult} dependency="app:explore-feed">
								{#snippet pending()}
									{@render literatureResultsSkeleton()}
								{/snippet}
								{#snippet failed(_error, retry)}
									<div class="rounded-lg border-2 border-destructive/25 bg-destructive/10 px-4 py-3">
										<p class="text-[13px] font-medium text-destructive">Hasil belum dapat dimuat.</p>
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
						<LiteratureSearchHero
							value={draft.q}
							onValueChange={handleQueryChange}
							onSubmit={handleSubmitQuery}
							onOpenFilters={handleOpenFiltersInResults}
						/>
						<DeferredQueryRegion result={feedResult} dependency="app:explore-feed">
							{#snippet pending()}
								<section class="pt-8"><ExploreFeedSkeleton /></section>
							{/snippet}
							{#snippet failed(_error, retry)}
								<section class="pt-8">
									<div class="rounded-lg border-2 border-destructive/25 bg-destructive/10 px-4 py-3">
										<p class="text-[13px] font-medium text-destructive">Temuan belum dapat dimuat.</p>
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
	</div>
</main>

{#snippet literatureResultsSkeleton()}
	<div class="flex flex-col gap-4">
		<div class="flex items-center justify-between gap-3">
			<Skeleton class="h-4 w-24" />
			<Skeleton class="h-8 w-40" />
		</div>
		<div class="divide-y divide-border overflow-hidden rounded-md border-2 border-border bg-card">
			{#each ['a', 'b', 'c', 'd', 'e'] as key (key)}
				<div class="flex gap-3 px-4 py-3.5">
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

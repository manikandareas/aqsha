<script lang="ts">
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import * as Alert from '@aqsha/ui-svelte/components/alert';
	import * as Select from '@aqsha/ui-svelte/components/select';
	import { Icon, AlertCircleIcon, SparklesIcon } from '$lib/icons';
	import { readableApiErrorMessage } from '$lib/errors';
	import type { useLiteratureSearch } from '$lib/features/discovery/api';
	import type { SearchSourceInput } from '$lib/features/citations/types';
	import {
		appliedLiteratureSignature,
		type AppliedLiteratureSearchState
	} from '../literature-search-state.svelte';
	import type { LiteraturePaper, LiteratureSortId } from '../literature-search-types';
	import { exploreSourceToSearchInput, literaturePaperToExploreSource } from '../explore-source';
	import ExploreSourceRow from './ExploreSourceRow.svelte';
	import ExploreSourceListSkeleton from './ExploreSourceListSkeleton.svelte';
	import LiteratureBatchBar from './LiteratureBatchBar.svelte';

	const SORT_OPTIONS: Array<{ id: LiteratureSortId; label: string }> = [
		{ id: 'relevance', label: 'Relevansi' },
		{ id: 'publication_date_desc', label: 'Tanggal terbit (terbaru)' },
		{ id: 'publication_date_asc', label: 'Tanggal terbit (terlama)' },
		{ id: 'citations_desc', label: 'Jumlah sitasi' },
		{ id: 'fwci_desc', label: 'Dampak (FWCI)' },
		{ id: 'authors_desc', label: 'Jumlah penulis' },
		{ id: 'references_desc', label: 'Jumlah referensi' }
	];

	/**
	 * Toolbar, list, and selection lifecycle for direct literature search results. Selection is
	 * local UI state — it resets whenever the applied query/sort/filter signature changes so a new
	 * search never carries over a stale selection.
	 */
	let {
		query,
		applied,
		onSortChange,
		onClearFilters,
		onLoadMore
	}: {
		query: ReturnType<typeof useLiteratureSearch>;
		applied: AppliedLiteratureSearchState;
		onSortChange: (sort: LiteratureSortId) => void;
		onClearFilters: () => void;
		onLoadMore: () => void;
	} = $props();

	const selectedKeys = new SvelteSet<string>();

	let lastSignature = untrack(() => appliedLiteratureSignature(applied));
	$effect(() => {
		const signature = appliedLiteratureSignature(applied);
		if (signature !== lastSignature) {
			lastSignature = signature;
			selectedKeys.clear();
		}
	});

	const items = $derived<LiteraturePaper[]>(
		(query.data?.pages ?? []).flatMap((page) => page.items)
	);
	const total = $derived(query.data?.pages[0]?.total ?? null);
	const hasNextPage = $derived(query.hasNextPage);
	const activeFilterCount = $derived(applied.filters.length);
	const isEmpty = $derived(!query.isPending && !query.isError && items.length === 0);

	const selectedSources = $derived<SearchSourceInput[]>(
		items
			.filter((item) => selectedKeys.has(item.key))
			.map((item) => exploreSourceToSearchInput(literaturePaperToExploreSource(item)))
	);

	function toggleSelected(key: string, checked: boolean): void {
		if (checked) selectedKeys.add(key);
		else selectedKeys.delete(key);
	}

	function clearSelection(): void {
		selectedKeys.clear();
	}
</script>

<div class="flex flex-col gap-4">
	<div
		class="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3"
	>
		<p class="text-label font-medium text-muted-foreground">
			{#if total !== null}
				{total.toLocaleString('id-ID')} hasil
			{:else}
				{items.length} hasil
			{/if}
			{#if activeFilterCount > 0}
				· {activeFilterCount} filter aktif
			{/if}
		</p>
		<div class="flex w-full items-center gap-1.5 sm:w-auto">
			<span
				id="literature-sort-label"
				class="shrink-0 text-label font-medium text-muted-foreground"
			>
				Urutkan
			</span>
			<Select.Root
				type="single"
				value={applied.sort}
				onValueChange={(value) => onSortChange(value as LiteratureSortId)}
			>
				<Select.Trigger
					aria-labelledby="literature-sort-label"
					class="w-full min-w-0 flex-1 sm:w-56 sm:flex-none"
				>
					<span class="truncate">
						{SORT_OPTIONS.find((option) => option.id === applied.sort)?.label ?? 'Relevansi'}
					</span>
				</Select.Trigger>
				<Select.Content align="end">
					{#each SORT_OPTIONS as option (option.id)}
						<Select.Item value={option.id} label={option.label}>{option.label}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>
	</div>

	{#if query.isError}
		<Alert.Root variant="destructive">
			<Icon icon={AlertCircleIcon} />
			<Alert.Title>Gagal memuat hasil</Alert.Title>
			<Alert.Description>
				{readableApiErrorMessage(query.error, 'Terjadi kesalahan saat mengambil hasil pencarian.')}
			</Alert.Description>
			<Alert.Action>
				<Button type="button" size="sm" variant="outline" onclick={() => query.refetch()}>
					Coba lagi
				</Button>
			</Alert.Action>
		</Alert.Root>
	{:else if query.isPending}
		<ExploreSourceListSkeleton label="Memuat hasil pencarian…" />
	{:else if isEmpty}
		{@render emptyState()}
	{:else}
		<div class="overflow-hidden" aria-label="Hasil pencarian">
			{#each items as paper (paper.key)}
				<ExploreSourceRow
					source={literaturePaperToExploreSource(paper)}
					selected={selectedKeys.has(paper.key)}
					onSelectedChange={(selected) => toggleSelected(paper.key, selected)}
				/>
			{/each}
		</div>

		{#if hasNextPage}
			<div class="flex justify-center py-4">
				<Button
					type="button"
					variant="outline"
					disabled={query.isFetchingNextPage}
					onclick={onLoadMore}
				>
					{query.isFetchingNextPage ? 'Memuat…' : 'Muat lagi'}
				</Button>
			</div>
		{/if}
	{/if}
</div>

<LiteratureBatchBar sources={selectedSources} onClear={clearSelection} />

{#snippet emptyState()}
	<div
		class="max-w-[560px] rounded-2xl border-2 border-border bg-card px-4 py-8 text-center sm:px-5"
	>
		<div
			class="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-mint-soft text-mint-foreground"
		>
			<Icon icon={SparklesIcon} class="size-5" />
		</div>
		<h3 class="text-[15px] font-semibold text-foreground">Tak ada hasil</h3>
		<p class="mx-auto mt-1.5 max-w-[380px] text-[13px] font-medium leading-5 text-muted-foreground">
			Tak ada paper yang cocok dengan kata kunci dan filter ini.
		</p>
		{#if activeFilterCount > 0}
			<Button type="button" variant="outline" size="sm" class="mt-4" onclick={onClearFilters}>
				Hapus semua filter
			</Button>
		{/if}
	</div>
{/snippet}

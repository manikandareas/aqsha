<script lang="ts">
	import LiteratureFilterEditor from './LiteratureFilterEditor.svelte';
	import type {
		LiteratureFilterCategoryId,
		LiteratureFilterClause,
		LiteratureFilterDefinition,
		LiteratureSortId
	} from '$lib/features/explore/literature-search-types';

	/** Desktop filter rail shares the draft with the mobile drawer so every viewport applies one query. */
	let {
		catalog,
		draft,
		onChange,
		onApply,
		onReset
	}: {
		catalog: {
			categories: Array<{ id: LiteratureFilterCategoryId; label: string }>;
			filters: LiteratureFilterDefinition[];
		};
		draft: { q: string; sort: LiteratureSortId; filters: LiteratureFilterClause[] };
		onChange: (patch: { filters: LiteratureFilterClause[] }) => void;
		onApply: () => void;
		onReset: () => void;
	} = $props();
</script>

<aside
	id="advanced-search"
	aria-label="Filter penelitian"
	class="sticky top-11 hidden h-[calc(100svh-2.75rem)] w-72 shrink-0 flex-col overflow-hidden rounded-lg border-2 border-border bg-card lg:flex"
>
	<div class="border-b-2 border-border px-4 py-4">
		<h2 class="font-heading text-base text-foreground">Filter penelitian</h2>
		<p class="mt-1 text-label text-muted-foreground">Persempit sumber tanpa meninggalkan hasil.</p>
	</div>
	<div class="min-h-0 flex-1 px-3 py-3">
		<LiteratureFilterEditor {catalog} {draft} {onChange} {onApply} {onReset} />
	</div>
</aside>

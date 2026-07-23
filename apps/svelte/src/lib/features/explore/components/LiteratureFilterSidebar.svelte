<script lang="ts">
	import LiteratureFilterEditor from './LiteratureFilterEditor.svelte';
	import type {
		LiteratureFilterCategoryId,
		LiteratureFilterClause,
		LiteratureFilterDefinition,
		LiteratureSortId
	} from '$lib/features/explore/literature-search-types';

	/**
	 * Desktop result-state filter surface — the same draft as the popover/drawer, presented as a
	 * sticky sidebar instead of a floating layer. `lg:block` keeps it out of the DOM's visible flow on
	 * narrower viewports, where `LiteratureFilterDrawer` takes over instead.
	 */
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
	aria-label="Advanced search"
	class="sticky top-11 hidden max-h-[calc(100svh-2.75rem)] w-[272px] shrink-0 overflow-y-auto border-r-2 border-border bg-card/40 px-4 py-5 lg:block"
>
	<h2 class="mb-4 font-heading text-base text-foreground">Advanced search</h2>
	<LiteratureFilterEditor {catalog} {draft} {onChange} {onApply} {onReset} />
</aside>

<script lang="ts">
	import LiteratureSearchBar from './LiteratureSearchBar.svelte';
	import LiteratureFilterPopover from './LiteratureFilterPopover.svelte';
	import type {
		LiteratureFilterCategoryId,
		LiteratureFilterClause,
		LiteratureFilterDefinition,
		LiteratureSortId
	} from '$lib/features/explore/literature-search-types';

	/**
	 * Centered landing hero for the paper-first Explore search — heading, description, static
	 * keyword examples, the wide search bar, and the initial advanced-search popover. Examples only
	 * fill the query text (never submit or run a semantic search); the popover itself is reachable
	 * before any query is typed, but its Apply stays disabled until a query exists.
	 */
	let {
		value,
		onValueChange,
		onSubmit,
		catalog,
		draft,
		onFilterChange,
		onApply,
		onReset,
		onDiscard,
		open = $bindable(false)
	}: {
		value: string;
		onValueChange: (query: string) => void;
		onSubmit: () => void;
		catalog: {
			categories: Array<{ id: LiteratureFilterCategoryId; label: string }>;
			filters: LiteratureFilterDefinition[];
		};
		draft: { q: string; sort: LiteratureSortId; filters: LiteratureFilterClause[] };
		onFilterChange: (patch: { filters: LiteratureFilterClause[] }) => void;
		onApply: () => void;
		onReset: () => void;
		onDiscard: () => void;
		open?: boolean;
	} = $props();

	const EXAMPLES = [
		'adaptasi iklim perkotaan',
		'transformer neural network',
		'stunting anak indonesia'
	];
</script>

<section class="flex flex-col items-center gap-6 px-2 pt-14 pb-8 text-center @2xl:pt-20">
	<div class="max-w-[560px] space-y-2">
		<h1
			class="font-heading text-[clamp(28px,3.2vw,40px)] leading-[1.08] font-medium tracking-tight text-balance text-foreground"
		>
			Cari literatur
		</h1>
		<p class="text-[14.5px] leading-relaxed text-muted-foreground">
			Telusuri paper OpenAlex dengan kata kunci, lalu persempit hasil lewat filter lanjutan.
		</p>
	</div>

	<div class="w-full max-w-[640px]">
		<LiteratureFilterPopover
			{catalog}
			{draft}
			onChange={onFilterChange}
			{onApply}
			{onReset}
			{onDiscard}
			bind:open
		>
			{#snippet trigger({ props })}
				<LiteratureSearchBar
					compact={false}
					{value}
					{onValueChange}
					{onSubmit}
					onOpenFilters={() => {}}
					filterTriggerProps={props}
				/>
			{/snippet}
		</LiteratureFilterPopover>
	</div>

	<div class="flex flex-wrap items-center justify-center gap-2">
		<span class="text-[12px] font-medium text-muted-foreground">Contoh:</span>
		{#each EXAMPLES as example (example)}
			<button
				type="button"
				onclick={() => onValueChange(example)}
				class="rounded-full border border-dashed border-border px-3 py-1.5 font-mono text-[11.5px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
			>
				{example}
			</button>
		{/each}
	</div>
</section>

<script lang="ts">
	import * as Sheet from '@aqsha/ui-svelte/components/sheet';
	import LiteratureFilterEditor from './LiteratureFilterEditor.svelte';
	import type {
		LiteratureFilterCategoryId,
		LiteratureFilterClause,
		LiteratureFilterDefinition,
		LiteratureSortId
	} from '$lib/features/explore/literature-search-types';

	/** Desktop filter surface — a side sheet keeps the result list full width while preserving the same draft lifecycle as the mobile drawer. */
	let {
		catalog,
		draft,
		onChange,
		onApply,
		onReset,
		onDiscard,
		open = $bindable(false)
	}: {
		catalog: {
			categories: Array<{ id: LiteratureFilterCategoryId; label: string }>;
			filters: LiteratureFilterDefinition[];
		};
		draft: { q: string; sort: LiteratureSortId; filters: LiteratureFilterClause[] };
		onChange: (patch: { filters: LiteratureFilterClause[] }) => void;
		onApply: () => void;
		onReset: () => void;
		onDiscard: () => void;
		open?: boolean;
	} = $props();

	let appliedSinceOpen = false;

	function handleApply(): void {
		appliedSinceOpen = true;
		onApply();
	}

	function handleOpenChange(next: boolean): void {
		if (!next && open && !appliedSinceOpen) onDiscard();
		if (next) appliedSinceOpen = false;
		open = next;
	}
</script>

<Sheet.Root {open} onOpenChange={handleOpenChange}>
	<Sheet.Content
		side="right"
		aria-describedby={undefined}
		class="flex w-full max-w-md flex-col gap-0 bg-card p-0"
	>
		<Sheet.Header class="shrink-0 border-b-2 border-border px-5 pb-4 pt-5 pr-16">
			<Sheet.Title>Filter penelitian</Sheet.Title>
			<Sheet.Description class="sr-only">Atur filter, lalu terapkan saat siap mencari.</Sheet.Description>
		</Sheet.Header>
		<div class="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-5 pt-4">
			<LiteratureFilterEditor {catalog} {draft} {onChange} onApply={handleApply} {onReset} />
		</div>
	</Sheet.Content>
</Sheet.Root>

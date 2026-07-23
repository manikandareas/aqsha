<script lang="ts">
	import * as Drawer from '@aqsha/ui-svelte/components/drawer';
	import LiteratureFilterEditor from './LiteratureFilterEditor.svelte';
	import type {
		LiteratureFilterCategoryId,
		LiteratureFilterClause,
		LiteratureFilterDefinition,
		LiteratureSortId
	} from '$lib/features/explore/literature-search-types';

	/**
	 * Mobile result-state filter surface — same draft/editor as the sidebar and popover, presented as
	 * a bottom sheet. Only reports `onDiscard` when the sheet closes without an Apply in between, so a
	 * successful Apply never triggers a spurious draft rollback.
	 */
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

<Drawer.Root {open} onOpenChange={handleOpenChange} direction="bottom">
	<Drawer.Content aria-describedby={undefined} class="flex max-h-[92svh] flex-col p-0">
		<Drawer.Header class="border-b border-border pb-3">
			<Drawer.Title>Advanced search</Drawer.Title>
		</Drawer.Header>
		<div class="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
			<LiteratureFilterEditor {catalog} {draft} {onChange} onApply={handleApply} {onReset} />
		</div>
	</Drawer.Content>
</Drawer.Root>

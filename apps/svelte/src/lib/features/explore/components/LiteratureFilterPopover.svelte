<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Popover from '@aqsha/ui-svelte/components/popover';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Icon, FilterIcon } from '$lib/icons';
	import LiteratureFilterEditor from './LiteratureFilterEditor.svelte';
	import type {
		LiteratureFilterCategoryId,
		LiteratureFilterClause,
		LiteratureFilterDefinition,
		LiteratureSortId
	} from '$lib/features/explore/literature-search-types';

	/**
	 * Portal-rendered advanced-search popover for the pre-search (landing) state. Wraps the shared
	 * `LiteratureFilterEditor`; owns only presentation (trigger, title, sizing, dismiss). Escape or an
	 * outside click closes the primitive and reports `onDiscard` so the caller can drop any unapplied
	 * draft edits — Apply itself never closes the popover, the caller decides once the commit lands.
	 */
	let {
		catalog,
		draft,
		onChange,
		onApply,
		onReset,
		onDiscard,
		open = $bindable(false),
		trigger
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
		trigger?: Snippet<[{ props: Record<string, unknown> }]>;
	} = $props();

	const uid = $props.id();
	const titleId = `${uid}-title`;

	function handleOpenChange(next: boolean): void {
		if (!next && open) onDiscard();
		open = next;
	}
</script>

<Popover.Root {open} onOpenChange={handleOpenChange}>
	<Popover.Trigger>
		{#snippet child({ props })}
			{#if trigger}
				{@render trigger({ props })}
			{:else}
				<Button {...props} type="button" variant="outline">
					<Icon icon={FilterIcon} class="size-4" />
					Filter
				</Button>
			{/if}
		{/snippet}
	</Popover.Trigger>
	<Popover.Content
		role="dialog"
		aria-labelledby={titleId}
		align="start"
		sideOffset={12}
		class="flex max-h-[min(85svh,720px)] w-[min(880px,calc(100vw-2rem))] flex-col gap-4 overflow-hidden p-5"
	>
		<Popover.Title id={titleId} class="font-heading text-lg text-foreground">
			Advanced search
		</Popover.Title>
		<div class="min-h-0 flex-1 overflow-y-auto pr-1">
			<LiteratureFilterEditor {catalog} {draft} {onChange} {onApply} {onReset} />
		</div>
	</Popover.Content>
</Popover.Root>

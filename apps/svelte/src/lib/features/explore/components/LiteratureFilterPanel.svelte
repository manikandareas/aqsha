<script lang="ts">
	import * as Drawer from '@aqsha/ui-svelte/components/drawer';
	import { cn } from '@aqsha/ui-svelte/utils';
	import { Icon, XIcon } from '$lib/icons';
	import { PANEL_TRANSITION_MS } from '$lib/components/layout/panel-surface';
	import { PanelInline } from '$lib/hooks/panel-inline.svelte';
	import LiteratureFilterEditor from './LiteratureFilterEditor.svelte';
	import type {
		LiteratureFilterCategoryId,
		LiteratureFilterClause,
		LiteratureFilterDefinition,
		LiteratureSortId
	} from '$lib/features/explore/literature-search-types';

	/**
	 * Filter surface for Explore. Above the panel-inline breakpoint it docks as the split layout's
	 * right column — results reflow beside it instead of being covered; below it, it overlays as a
	 * bottom drawer. Both modes share one editor. The draft lifecycle stays with the page: edits are
	 * staged through `onChange` and only reach the URL on Apply.
	 *
	 * Dressed in the nav rail's language — same `bg-sidebar` surface, 12px gutter, compact icon
	 * buttons — and flush like it: the split layout's `rail` variant floats the results column over
	 * this surface as a rounded card, so the framing belongs to main, not to this column.
	 */
	let {
		open,
		catalog,
		draft,
		activeCount,
		onChange,
		onApply,
		onReset,
		onClose
	}: {
		open: boolean;
		catalog: {
			categories: Array<{ id: LiteratureFilterCategoryId; label: string }>;
			filters: LiteratureFilterDefinition[];
		};
		draft: { q: string; sort: LiteratureSortId; filters: LiteratureFilterClause[] };
		/** Count of filters already applied to the search, not of staged draft edits. */
		activeCount: number;
		onChange: (patch: { filters: LiteratureFilterClause[] }) => void;
		onApply: () => void;
		onReset: () => void;
		onClose: () => void;
	} = $props();

	const panelInline = new PanelInline();
	const inline = $derived(panelInline.current);

	// Keep the body mounted through the inline close transition so the column fades instead of
	// blanking mid-slide.
	let closing = $state(false);
	const present = $derived(open || closing);
	$effect(() => {
		if (open) {
			closing = false;
			return;
		}
		closing = true;
		const timer = setTimeout(() => {
			closing = false;
		}, PANEL_TRANSITION_MS);
		return () => clearTimeout(timer);
	});
</script>

{#snippet panelBody()}
	<div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-sidebar">
		<div class="flex shrink-0 items-center justify-between gap-2 px-3 pt-3.5 pb-2">
			<div class="flex min-w-0 items-center gap-1.5">
				<h2 class="truncate text-label font-medium text-muted-foreground">Filter penelitian</h2>
				{#if activeCount > 0}
					<span
						class="shrink-0 rounded-full bg-mint-soft px-1.5 py-0.5 text-micro text-mint-foreground"
						aria-label={`${activeCount} filter aktif`}
					>
						{activeCount}
					</span>
				{/if}
			</div>
			<button
				type="button"
				onclick={onClose}
				aria-label="Tutup filter"
				class="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-[background-color,color] duration-150 ease-out hover:bg-primary/10 hover:text-primary"
			>
				<Icon icon={XIcon} class="size-3.5" />
			</button>
		</div>

		<div class="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-3 pt-1">
			<LiteratureFilterEditor {catalog} {draft} {onChange} {onApply} {onReset} />
		</div>
	</div>
{/snippet}

{#if inline}
	<aside
		aria-label="Filter penelitian"
		inert={!open}
		aria-hidden={!open}
		class={cn(
			'@container flex min-h-0 w-auto min-w-0 flex-col overflow-hidden bg-sidebar transition-opacity ease-out',
			!open && 'opacity-0'
		)}
		style="transition-duration: {PANEL_TRANSITION_MS}ms"
	>
		{#if present}
			{@render panelBody()}
		{/if}
	</aside>
{:else}
	<Drawer.Root {open} onOpenChange={(next) => !next && onClose()} direction="bottom">
		<Drawer.Content aria-describedby={undefined} class="flex h-[88svh] flex-col bg-sidebar p-0">
			<Drawer.Title class="sr-only">Filter penelitian</Drawer.Title>
			{@render panelBody()}
		</Drawer.Content>
	</Drawer.Root>
{/if}

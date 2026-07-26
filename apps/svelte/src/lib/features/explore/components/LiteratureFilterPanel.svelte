<script lang="ts">
	import * as Drawer from '@aqsha/ui-svelte/components/drawer';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { cn } from '@aqsha/ui-svelte/utils';
	import { Icon, XIcon } from '$lib/icons';
	import SidePanelFrame from '$lib/components/layout/SidePanelFrame.svelte';
	import {
		PANEL_TRANSITION_MS,
		panelHeaderBarClass,
		sidePanelColumnClass
	} from '$lib/components/layout/panel-surface';
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

{#snippet header()}
	<div class={panelHeaderBarClass}>
		<div class="flex min-w-0 items-center gap-2">
			<h2 class="truncate text-sm font-semibold text-foreground">Filter penelitian</h2>
			{#if activeCount > 0}
				<span
					class="shrink-0 rounded-full bg-mint-soft px-1.5 py-0.5 text-micro text-mint-foreground"
					aria-label={`${activeCount} filter aktif`}
				>
					{activeCount}
				</span>
			{/if}
		</div>
		<Button
			type="button"
			variant="ghost"
			size="icon-sm"
			class="-mr-1.5 text-muted-foreground hover:text-foreground"
			aria-label="Tutup filter"
			onclick={onClose}
		>
			<Icon icon={XIcon} class="size-4" />
		</Button>
	</div>
{/snippet}

{#snippet body()}
	<!-- Matches the header bar's inset so the drawer (no card) keeps one left edge top to bottom. -->
	<div class="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-5 pt-4">
		<LiteratureFilterEditor {catalog} {draft} {onChange} {onApply} {onReset} />
	</div>
{/snippet}

{#if inline}
	<aside
		aria-label="Filter penelitian"
		inert={!open}
		aria-hidden={!open}
		class={cn(sidePanelColumnClass, 'transition-opacity ease-out', !open && 'opacity-0')}
		style="transition-duration: {PANEL_TRANSITION_MS}ms"
	>
		{#if present}
			<SidePanelFrame {header} children={body} />
		{/if}
	</aside>
{:else}
	<Drawer.Root {open} onOpenChange={(next) => !next && onClose()} direction="bottom">
		<Drawer.Content aria-describedby={undefined} class="flex h-[88svh] flex-col p-0">
			<Drawer.Title class="sr-only">Filter penelitian</Drawer.Title>
			<SidePanelFrame {header} children={body} />
		</Drawer.Content>
	</Drawer.Root>
{/if}

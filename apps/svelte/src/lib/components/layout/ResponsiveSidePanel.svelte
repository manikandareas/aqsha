<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Drawer from '$lib/components/ui/drawer/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { PanelInline } from '$lib/hooks/panel-inline.svelte';
	import { PANEL_TRANSITION_MS, sidePanelColumnClass } from './panel-surface';
	import { cn } from '$lib/utils';

	/**
	 * Responsive side panel. Wide viewport: docks inline as the grid's second column (0-width track
	 * when closed, so `DetailSplitLayout` can tween the slide); content stays mounted through the close
	 * transition, fades out, and is inert while closed. Narrow viewport: overlays main as a bottom
	 * drawer (vaul-svelte) that can be swiped to dismiss.
	 *
	 * Children stay mounted through the close transition. A consumer may freeze children while closing
	 * so recomputed default content does not swap mid-animation.
	 */
	let { open, children }: { open: boolean; children: Snippet } = $props();

	const panelInline = new PanelInline();
	const canInset = $derived(panelInline.current);
	const sidebar = Sidebar.useSidebar();

	// Keep children mounted through the close transition (present while open OR closing).
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

{#if canInset}
	<Sidebar.Inset
		inert={!open}
		aria-hidden={!open}
		class={cn(sidePanelColumnClass, 'transition-opacity ease-out', !open && 'opacity-0')}
		style="transition-duration: {PANEL_TRANSITION_MS}ms"
	>
		{#if present}
			{@render children()}
		{/if}
	</Sidebar.Inset>
{:else}
	<Drawer.Root {open} onOpenChange={(next) => !next && sidebar.setOpen(false)} direction="bottom">
		<Drawer.Content aria-describedby={undefined} class="h-[88vh] p-0">
			<Drawer.Title class="sr-only">Panel detail</Drawer.Title>
			<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
				{#if present}
					{@render children()}
				{/if}
			</div>
		</Drawer.Content>
	</Drawer.Root>
{/if}

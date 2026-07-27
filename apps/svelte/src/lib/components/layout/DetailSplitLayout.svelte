<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { cn } from '@aqsha/ui-svelte/utils';
	import { PanelInline } from '$lib/hooks/panel-inline.svelte';
	import {
		detailSplitMainRailClass,
		detailSplitMainSurfaceClass,
		PANEL_TRANSITION_MS
	} from './panel-surface';
	import { panelExpandContext } from './panel-expand.svelte';

	/**
	 * Two-column main + side-panel split. Reuses `Sidebar.Provider` as the panel's open/close state
	 * machine. ALWAYS two grid tracks (side is 0-width when closed) so `grid-template-columns`
	 * interpolates the open/close slide and the expand (30:70) tween. Provides the panel-expand
	 * seam via context. Docks inline only above the panel-inline breakpoint; below it
	 * `ResponsiveSidePanel` overlays main as a bottom drawer.
	 */
	let {
		main,
		side,
		sideOpen,
		onSideOpenChange,
		sideWidth = 'clamp(26rem,32vw,32rem)',
		sideVariant = 'panel'
	}: {
		main: Snippet;
		side: Snippet;
		sideOpen: boolean;
		onSideOpenChange: (open: boolean) => void;
		/** Docked width of the side track. Any CSS length; the closed/expanded tracks are fixed. */
		sideWidth?: string;
		/**
		 * `panel` — main stays full-bleed and the side column brings its own framing.
		 * `rail` — the nav sidebar's inset shell mirrored to this edge: the side column is a flush
		 * rail surface and main floats over it as a card, rounded on the edge that faces the rail.
		 */
		sideVariant?: 'panel' | 'rail';
	} = $props();

	const panelInline = new PanelInline();
	const canInset = $derived(panelInline.current);
	const inset = $derived(sideOpen && canInset);

	// Expanded = a 30:70 split, sticky across open/close within the page mount.
	let expanded = $state(false);

	const sideTrack = $derived(inset ? (expanded ? '70%' : sideWidth) : '0rem');

	const rail = $derived(sideVariant === 'rail');
	// Only rounds/gutters while the rail is actually docked — a closed rail must leave no strip of
	// rail surface showing past main's edge.
	const mainSurface = $derived(
		rail
			? cn(detailSplitMainRailClass, inset ? 'mr-2 rounded-r-xl' : 'rounded-none')
			: detailSplitMainSurfaceClass
	);

	panelExpandContext.set({
		get canExpand() {
			return canInset;
		},
		get expanded() {
			return expanded;
		},
		setExpanded: (value: boolean) => {
			expanded = value;
		}
	});
</script>

<Sidebar.Provider
	open={sideOpen}
	onOpenChange={onSideOpenChange}
	persist={false}
	class="flex min-h-0 min-h-svh flex-1 flex-col overflow-hidden bg-background"
>
	<div
		style="transition-duration: {PANEL_TRANSITION_MS}ms; grid-template-columns: minmax(0,1fr) {sideTrack}"
		class={cn(
			'grid min-h-0 w-full flex-1 transition-[grid-template-columns] ease-out',
			rail && 'bg-sidebar'
		)}
	>
		<Sidebar.Inset class={mainSurface} style="transition-duration: {PANEL_TRANSITION_MS}ms">
			{@render main()}
		</Sidebar.Inset>
		{@render side()}
	</div>
</Sidebar.Provider>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { PanelInline } from '$lib/hooks/panel-inline.svelte';
	import { detailSplitMainSurfaceClass, PANEL_TRANSITION_MS } from './panel-surface';
	import { panelExpandContext } from './panel-expand.svelte';
	import { cn } from '$lib/utils';

	/**
	 * Two-column main + side-panel split — ported 1:1 from
	 * apps/web/components/layout/detail-split-layout.tsx. Reuses `Sidebar.Provider` as the
	 * panel's open/close state machine. ALWAYS two grid tracks (side is 0-width when closed) so
	 * `grid-template-columns` interpolates the open/close slide and the expand (30:70) tween.
	 * Provides the panel-expand seam via context. Docks inline only above the panel-inline
	 * breakpoint; below it `ResponsiveSidePanel` overlays main as a bottom drawer.
	 *
	 * Consumer-validated in Phase 6/7 (no thread/workspace surface exists in Phase 3).
	 */
	let {
		main,
		side,
		sideOpen,
		onSideOpenChange
	}: {
		main: Snippet;
		side: Snippet;
		sideOpen: boolean;
		onSideOpenChange: (open: boolean) => void;
	} = $props();

	const panelInline = new PanelInline();
	const canInset = $derived(panelInline.current);
	const inset = $derived(sideOpen && canInset);

	// Expanded = a 30:70 split, sticky across open/close within the page mount.
	let expanded = $state(false);

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
	class="flex min-h-0 min-h-svh flex-1 flex-col overflow-hidden bg-background"
>
	<div
		style="transition-duration: {PANEL_TRANSITION_MS}ms"
		class={cn(
			'grid min-h-0 w-full flex-1 transition-[grid-template-columns] ease-out',
			inset
				? expanded
					? 'grid-cols-[minmax(0,1fr)_70%]'
					: 'grid-cols-[minmax(0,1fr)_clamp(26rem,32vw,32rem)]'
				: 'grid-cols-[minmax(0,1fr)_0rem]'
		)}
	>
		<Sidebar.Inset class={detailSplitMainSurfaceClass}>
			{@render main()}
		</Sidebar.Inset>
		{@render side()}
	</div>
</Sidebar.Provider>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { PanelInline } from '$lib/hooks/panel-inline.svelte';
	import { panelBodyColumnClass, sidePanelCardClass } from '$lib/panel-surface';

	/**
	 * Shared frame for every right side-panel surface — ported 1:1 from
	 * apps/web/components/layout/side-panel-frame.tsx (`SidePanelFrame`). Splits the header OUT
	 * of the card: `header` renders flush at the top of the column, the body tucks into the
	 * floating card below it (inline/desktop) or stays flush (narrow-viewport drawer).
	 */
	let { header, children }: { header: Snippet; children: Snippet } = $props();

	const panelInline = new PanelInline();
	const inset = $derived(panelInline.current);
</script>

<div class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
	{@render header()}
	<div class={inset ? sidePanelCardClass : panelBodyColumnClass}>
		{@render children()}
	</div>
</div>

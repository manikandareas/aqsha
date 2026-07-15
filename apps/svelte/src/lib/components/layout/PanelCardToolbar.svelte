<script lang="ts">
	import type { Snippet } from 'svelte';
	import PanelBarContent from './PanelBarContent.svelte';
	import { panelCardToolbarClass } from './panel-surface';

	/** Compact toolbar at the top of the floating side-panel card — padanan web `PanelCardToolbar`. */
	let { title, eyebrow, actions }: { title: Snippet; eyebrow?: string; actions?: Snippet } =
		$props();
</script>

<div class={panelCardToolbarClass}>
	<PanelBarContent {title} {eyebrow} {actions} />
</div>

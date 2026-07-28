<script lang="ts">
	import type { Snippet } from 'svelte';
	import PanelBarContent from './PanelBarContent.svelte';
	import { panelHeaderBarClass } from './panel-surface';

	/** Compact glass header bar for a side panel. */
	let { title, eyebrow, actions }: { title: Snippet; eyebrow?: string; actions?: Snippet } =
		$props();
</script>

<header class={panelHeaderBarClass}>
	<PanelBarContent {title} {eyebrow} {actions} />
</header>

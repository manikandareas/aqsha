<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Icon, ExpandIcon, ShrinkIcon } from '$lib/icons';
	import { panelExpandContext } from './panel-expand.svelte';

	/**
	 * Expand toggle for the panel header — widens the inline panel to the 30:70 split.
	 * Renders nothing in the narrow-viewport drawer (already full-width) or outside a
	 * `DetailSplitLayout`. Padanan web `PanelExpandButton`.
	 */
	const expand = panelExpandContext.getOptional();
</script>

{#if expand && expand.canExpand}
	<Button
		type="button"
		variant="ghost"
		class="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
		onclick={() => expand.setExpanded(!expand.expanded)}
		aria-label={expand.expanded ? 'Kecilkan panel' : 'Perluas panel'}
		aria-pressed={expand.expanded}
	>
		<Icon icon={expand.expanded ? ShrinkIcon : ExpandIcon} class="size-3.5" />
	</Button>
{/if}

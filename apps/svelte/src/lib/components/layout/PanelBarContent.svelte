<script lang="ts">
	import type { Snippet } from 'svelte';

	/** Title/eyebrow + actions clusters shared by `PanelHeaderBar` and `PanelCardToolbar`
	 *  (padanan web `PanelBarContent`). */
	let { title, eyebrow, actions }: { title: Snippet; eyebrow?: string; actions?: Snippet } =
		$props();
</script>

<div class="flex min-w-0 items-center gap-2">
	{@render title()}
	{#if eyebrow}
		<span class="shrink-0 text-[11px] font-medium text-muted-foreground">{eyebrow}</span>
	{/if}
</div>
{#if actions}
	<div class="flex shrink-0 items-center gap-1">{@render actions()}</div>
{/if}

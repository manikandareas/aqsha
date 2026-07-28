<script lang="ts">
	import type { Snippet } from 'svelte';

	// Header zona Explore: judul serif + subjudul + hairline + slot kanan.
	// Dipakai ExploreFindings untuk header hasil pencarian.
	let {
		title,
		subtitle,
		right
	}: {
		title: string;
		subtitle?: string;
		right?: Snippet;
	} = $props();
</script>

<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
	<h2 class="shrink-0 font-heading text-2xl font-semibold tracking-tight text-foreground">
		{title}
	</h2>
	{#if subtitle}<span class="shrink-0 text-[13px] text-muted-foreground">{subtitle}</span>{/if}
	<span class="h-px min-w-6 flex-1 bg-border" aria-hidden="true"></span>
	{@render right?.()}
</div>

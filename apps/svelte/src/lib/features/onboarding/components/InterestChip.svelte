<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	/** Pill toggle for multi-select interests. */
	let {
		selected,
		onclick,
		children
	}: { selected: boolean; onclick: () => void; children: Snippet } = $props();
</script>

<button
	type="button"
	{onclick}
	aria-pressed={selected}
	class={cn(
		'rounded-full border px-3.5 py-1.5 text-sm transition-colors',
		selected
			? 'border-primary bg-primary/10 font-medium text-primary'
			: 'border-border/60 text-muted-foreground hover:border-border hover:text-foreground'
	)}
>
	{@render children()}
</button>

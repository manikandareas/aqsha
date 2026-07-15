<script lang="ts">
	import type { Snippet } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import { scale } from 'svelte/transition';
	import { cn } from '$lib/utils';
	import { Icon, CheckIcon } from '$lib/icons';

	/**
	 * Full-width single-select row (background + source). Border-only so the page stays card-less and
	 * clean; selection shows the accent border + a filled check.
	 */
	let {
		selected,
		onclick,
		children
	}: { selected: boolean; onclick: () => void; children: Snippet } = $props();

	const reduce = $derived(prefersReducedMotion.current);
</script>

<button
	type="button"
	{onclick}
	aria-pressed={selected}
	class={cn(
		'flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors',
		selected
			? 'border-primary bg-primary/5 text-foreground'
			: 'border-border/60 text-muted-foreground hover:border-border hover:text-foreground'
	)}
>
	<span class="font-medium">{@render children()}</span>
	<span
		aria-hidden="true"
		class={cn(
			'flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors',
			selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border/70'
		)}
	>
		{#if selected}
			<span transition:scale={reduce ? { duration: 0 } : { duration: 150, start: 0.4 }}>
				<Icon icon={CheckIcon} class="size-3" />
			</span>
		{/if}
	</span>
</button>

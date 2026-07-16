<script lang="ts">
	import type { Snippet } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import { scale } from 'svelte/transition';
	import { cn } from '@aqsha/ui-svelte/utils';
	import { Icon, CheckIcon } from '$lib/icons';

	/**
	 * Full-width single-select row (background + source). Selection is an exclusive choice, so it
	 * speaks ink (primary border + static lip + filled check), never mint — mint stays the
	 * binary-state color (see InterestChip). 2px border per the system's surface grammar.
	 */
	let {
		selected,
		onclick,
		index,
		children
	}: { selected: boolean; onclick: () => void; index?: number; children: Snippet } = $props();

	const reduce = $derived(prefersReducedMotion.current);
</script>

<button
	type="button"
	{onclick}
	aria-pressed={selected}
	class={cn(
		'flex min-h-11 w-full items-center justify-between gap-3 rounded-md border-2 px-4 py-2.5 text-left text-sm',
		'transition-[color,background-color,border-color,box-shadow] duration-150',
		'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
		selected
			? 'lip-static border-primary bg-card text-foreground [--lip-color:var(--primary)]'
			: 'border-border/70 text-muted-foreground hover:bg-card hover:text-foreground'
	)}
>
	{#if index != null}
		<!-- Milestone number mirroring the trail-map dots; aria-hidden keeps the accessible name clean. -->
		<span
			aria-hidden="true"
			class={cn(
				'w-6 shrink-0 font-mono text-[11px] tabular-nums transition-colors duration-150',
				selected ? 'text-foreground' : 'text-muted-foreground/70'
			)}
		>
			{String(index).padStart(2, '0')}
		</span>
	{/if}
	<span class="flex-1 font-medium">{@render children()}</span>
	<span
		aria-hidden="true"
		class={cn(
			'flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-150',
			selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
		)}
	>
		{#if selected}
			<span transition:scale={reduce ? { duration: 0 } : { duration: 150, start: 0.4 }}>
				<Icon icon={CheckIcon} class="size-3" />
			</span>
		{/if}
	</span>
</button>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '@aqsha/ui-svelte/utils';
	import { INTEREST_STAR_GLYPH } from '../lib/journey-art';

	/**
	 * Pill toggle for multi-select interests. Each chip is a binary state, so "on" speaks mint —
	 * the system's state color — while ink stays reserved for exclusive choices. The star glyph
	 * mirrors the chip's star in the constellation pane: picking a chip lights it up.
	 */
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
		// Weight and border width stay constant across states — toggling either re-measures the
		// pill and re-wraps the row.
		'inline-flex items-center gap-1.5 rounded-full border-2 px-3.5 py-1.5 text-sm font-medium transition-colors duration-150',
		'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
		selected
			? 'border-mint-soft-border bg-mint-soft text-mint-foreground'
			: 'border-border/70 text-muted-foreground hover:bg-card hover:text-foreground'
	)}
>
	<svg
		viewBox="0 0 12 12"
		aria-hidden="true"
		class={cn(
			'size-3 shrink-0 transition-transform duration-200',
			selected && 'rotate-90 scale-110'
		)}
	>
		<path
			d={INTEREST_STAR_GLYPH}
			fill={selected ? 'var(--mint)' : 'none'}
			stroke="currentColor"
			stroke-width={selected ? 0 : 1.3}
			stroke-linejoin="round"
			opacity={selected ? 1 : 0.5}
		/>
	</svg>
	{@render children()}
</button>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';
	import { Icon, CheckIcon } from '$lib/icons';

	/**
	 * Full-width single-select row (background + source). Border-only so the page stays card-less
	 * and clean; selection shows the accent border + a filled check. Port 1:1 from
	 * apps/web/features/onboarding/components/onboarding-controls.tsx (SelectableOption).
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
			<Icon icon={CheckIcon} class="size-3" />
		{/if}
	</span>
</button>

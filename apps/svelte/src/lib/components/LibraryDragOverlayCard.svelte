<script lang="ts">
	import { scale } from 'svelte/transition';
	import { prefersReducedMotion } from 'svelte/motion';
	import { cn } from '$lib/utils';

	const MAX_VISIBLE_PILLS = 3;

	/**
	 * macOS-Finder-style drag preview: a compact capsule showing just the filename that follows the
	 * pointer. Dragging a multi-selection fans the capsules into a short diagonal cascade — the grabbed
	 * item on top, the rest peeking below — with a count badge for the true total. Reduced-motion users
	 * get static pills.
	 */
	let { titles }: { titles: string[] } = $props();

	const reduce = $derived(prefersReducedMotion.current);
	const total = $derived(titles.length);
	const primaryTitle = $derived(titles[0]);
	// Fan each trailing pill a fixed step further down-right and dimmer, so the cascade scales with
	// MAX_VISIBLE_PILLS instead of hardcoding offsets per index.
	const cascade = $derived(titles.slice(1).slice(0, MAX_VISIBLE_PILLS - 1));

	const pillBase =
		'max-w-[13rem] truncate rounded-full border border-border bg-card px-3 py-1.5 text-[12px] leading-none text-foreground';
</script>

{#if total > 0}
	<div
		class="w-fit"
		in:scale={reduce ? { duration: 0 } : { start: 0.9, opacity: 0.5, duration: 220 }}
	>
		<div
			class={cn(
				'pointer-events-none relative w-fit cursor-grabbing select-none',
				reduce ? '' : 'rotate-[-3deg]'
			)}
		>
			{#each cascade as title, index (`${index}-${title}`)}
				{@const depth = index + 1}
				<span
					class={cn('absolute left-0 top-0 block font-medium shadow-lg', pillBase)}
					style="transform: translate({depth * 8}px, {depth * 22}px); opacity: {0.9 -
						index * 0.2}; z-index: {-depth * 10};"
				>
					{title}
				</span>
			{/each}
			<span
				class={cn(
					'relative z-0 block font-semibold shadow-2xl shadow-foreground/25 ring-1 ring-foreground/5',
					pillBase
				)}
			>
				{primaryTitle}
			</span>
			{#if total > 1}
				<span
					class="absolute -right-2 -top-2 z-10 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-[12px] font-semibold leading-none text-primary-foreground shadow-md ring-2 ring-background"
				>
					{total}
				</span>
			{/if}
		</div>
	</div>
{/if}

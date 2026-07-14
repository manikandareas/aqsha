<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	/**
	 * Text shimmer — a moving highlight sweeping across the text (Astra "working" labels). Port of
	 * `ai-elements/shimmer.tsx`; the web version animated `background-position` via motion, here it is a
	 * pure CSS keyframe (`--spread` scales with text length) so it needs no motion runtime and honours
	 * `prefers-reduced-motion` (the animation is disabled under reduced motion via the utility class).
	 */
	let {
		children,
		as = 'p',
		class: className,
		text,
		spread = 2
	}: {
		children?: Snippet;
		as?: 'p' | 'span' | 'div';
		class?: string;
		/** Text content (used to size the shimmer spread); pass when not using the children snippet. */
		text?: string;
		spread?: number;
	} = $props();

	const dynamicSpread = $derived((text?.length ?? 8) * spread);
</script>

<svelte:element
	this={as}
	class={cn('aqsha-shimmer relative inline-block', className)}
	style="--spread: {dynamicSpread}px"
>
	{#if children}{@render children()}{:else}{text}{/if}
</svelte:element>

<style>
	:global(.aqsha-shimmer) {
		background-image:
			linear-gradient(
				90deg,
				transparent calc(50% - var(--spread)),
				var(--color-background),
				transparent calc(50% + var(--spread))
			),
			linear-gradient(var(--color-muted-foreground), var(--color-muted-foreground));
		background-repeat: no-repeat, padding-box;
		background-size:
			250% 100%,
			auto;
		background-clip: text;
		color: transparent;
		animation: aqsha-shimmer-move 2s linear infinite;
	}

	@keyframes aqsha-shimmer-move {
		from {
			background-position: 100% center;
		}
		to {
			background-position: 0% center;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		:global(.aqsha-shimmer) {
			animation: none;
		}
	}
</style>

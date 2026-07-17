<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '@aqsha/ui-svelte/utils';

	/**
	 * Text shimmer — opacity pulse on muted foreground (Astra "working" labels).
	 * Solid color only (no gradients); honours `prefers-reduced-motion`.
	 */
	let {
		children,
		as = 'p',
		class: className,
		text
	}: {
		children?: Snippet;
		as?: 'p' | 'span' | 'div';
		class?: string;
		/** Text content when not using the children snippet. */
		text?: string;
	} = $props();
</script>

<svelte:element this={as} class={cn('aqsha-text-shimmer relative inline-block', className)}>
	{#if children}{@render children()}{:else}{text}{/if}
</svelte:element>

<style>
	/* Dedicated class so text-shimmer never collides with block skeleton loaders. */
	:global(.aqsha-text-shimmer) {
		color: var(--color-muted-foreground);
		animation: aqsha-text-shimmer-pulse 1.4s ease-in-out infinite;
	}

	@keyframes aqsha-text-shimmer-pulse {
		0%,
		100% {
			opacity: 0.45;
		}
		50% {
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		:global(.aqsha-text-shimmer) {
			animation: none;
			opacity: 1;
		}
	}
</style>

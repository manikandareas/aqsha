<script lang="ts">
	import type { Snippet } from 'svelte';
	import { MotionState, motionContext } from '$lib/motion';

	/**
	 * Motion boundary — padanan web `components/motion-provider.tsx`. Framer-motion's
	 * `LazyMotion` has no Svelte equivalent (transitions are built in), so this provider
	 * only publishes the reduced-motion seam via context and renders children, preserving
	 * the web provider order.
	 */
	let { children }: { children: Snippet } = $props();

	motionContext.set(new MotionState());
</script>

{@render children()}

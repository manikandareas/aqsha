<script lang="ts">
	import type { Snippet } from 'svelte';
	import { MotionState, motionContext } from '$lib/motion';

	/**
	 * Motion boundary. Publishes the reduced-motion seam via context and renders children.
	 */
	let { children }: { children: Snippet } = $props();

	motionContext.set(new MotionState());
</script>

{@render children()}

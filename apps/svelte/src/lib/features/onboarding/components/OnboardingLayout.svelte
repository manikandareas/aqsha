<script lang="ts">
	import type { Snippet } from 'svelte';
	import '../lib/journey-stagger.css';

	// Full-viewport canvas only — no width cap here. The page composes the journey
	// rail + content measure inside; capping width at this boundary would force every
	// step back into a centered generic form.
	let { children }: { children: Snippet } = $props();
</script>

<main class="journey-canvas min-h-svh w-full overflow-x-clip bg-background text-foreground">
	{@render children()}
</main>

<style>
	/* Faint dotted graph-paper texture — the field-notebook canvas under every chapter. */
	.journey-canvas {
		background-image: radial-gradient(
			color-mix(in oklch, var(--border) 55%, transparent) 1px,
			transparent 1.5px
		);
		background-size: 26px 26px;
	}
</style>

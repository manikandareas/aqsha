<script lang="ts">
	import type { Snippet } from 'svelte';

	// Full-viewport, card-less canvas: the page background only, content centered.
	// Port 1:1 from apps/web/features/onboarding/components/onboarding-layout.tsx.
	let { children }: { children: Snippet } = $props();
</script>

<main class="flex min-h-svh w-full items-center justify-center px-6 py-12">
	<div class="w-full max-w-xl">{@render children()}</div>
</main>

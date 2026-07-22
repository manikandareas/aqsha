<script lang="ts">
	import type { Snippet } from 'svelte';
	import { HydrationBoundary, type DehydratedState } from '@tanstack/svelte-query';

	let { state, children }: { state: DehydratedState; children: Snippet } = $props();
</script>

<HydrationBoundary {state} options={undefined} queryClient={undefined}>
	{@render children()}
</HydrationBoundary>

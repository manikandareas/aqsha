<script lang="ts">
	import type { Snippet } from 'svelte';
	import { invalidate } from '$app/navigation';
	import QueryHydrationBoundary from './QueryHydrationBoundary.svelte';
	import type { DeferredQueryError, DeferredQueryResult } from './bootstrap';

	let {
		result,
		dependency,
		children,
		pending,
		failed
	}: {
		result: Promise<DeferredQueryResult>;
		dependency: string;
		children: Snippet;
		pending: Snippet;
		failed: Snippet<[DeferredQueryError, () => void]>;
	} = $props();

	function retry(): void {
		void invalidate(dependency);
	}
</script>

{#await result}
	{@render pending()}
{:then resolved}
	{#if resolved.ok}
		<QueryHydrationBoundary state={resolved.state}>
			{@render children()}
		</QueryHydrationBoundary>
	{:else}
		{@render failed(resolved.error, retry)}
	{/if}
{/await}

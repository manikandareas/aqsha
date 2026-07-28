<script lang="ts">
	import QueryHydrationBoundary from '$lib/query/QueryHydrationBoundary.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
</script>

<QueryHydrationBoundary state={data.projectBootstrap.critical}>
	{@render children()}
</QueryHydrationBoundary>

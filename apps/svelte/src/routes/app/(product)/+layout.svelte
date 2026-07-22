<script lang="ts">
	import AppShell from '$lib/components/layout/AppShell.svelte';
	import { QueryHydrationBoundary } from '$lib/query';
	import type { LayoutProps } from './$types';

	/**
	 * Product shell layout — wraps every `/app` surface in the persistent `AppShell` (sidebar + inset).
	 */
	let { data, children }: LayoutProps = $props();
</script>

<QueryHydrationBoundary state={data.workspaceBootstrap.critical}>
	<AppShell open={data.sidebarOpen}>
		{@render children()}
	</AppShell>
</QueryHydrationBoundary>

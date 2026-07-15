<script lang="ts">
	import type { Snippet } from 'svelte';
	import AppShell from '$lib/components/layout/AppShell.svelte';
	import type { LayoutData } from './$types';

	/**
	 * Product shell layout — wraps every `/app` surface in the persistent `AppShell` (sidebar + inset).
	 */
	let { data, children }: { data: LayoutData; children: Snippet } = $props();
</script>

<AppShell open={data.sidebarOpen}>
	{@render children()}
</AppShell>

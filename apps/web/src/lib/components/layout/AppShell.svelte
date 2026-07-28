<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import AppSidebar from './AppSidebar.svelte';
	import AppNavSidebarBridge from './AppNavSidebarBridge.svelte';

	let { open = true, children }: { open?: boolean; children: Snippet } = $props();
</script>

<Sidebar.Provider
	{open}
	style="--sidebar-width: 16.5rem; --sidebar-width-mobile: 17.5rem; --sidebar-width-icon: 3rem;"
	class="min-h-svh"
>
	<AppNavSidebarBridge>
		<AppSidebar />
		<Sidebar.Inset class="relative bg-background text-foreground">
			<div class="flex min-h-0 flex-1 flex-col">{@render children()}</div>
		</Sidebar.Inset>
	</AppNavSidebarBridge>
</Sidebar.Provider>

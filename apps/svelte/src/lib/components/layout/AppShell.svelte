<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import AppSidebar from './AppSidebar.svelte';

	/**
	 * Persistent shell for every authenticated product surface. Hoists the left navigation so it stays mounted
	 * across navigations (no remount/flicker). Pages render into `Sidebar.Inset`, which is
	 * `relative` so a route-level loading overlay (variant="absolute") fills just the content
	 * area, not the nav. `open` is the cookie-persisted initial state (read server-side in
	 * `routes/app/+layout.server.ts`); `Sidebar.Provider` writes the `sidebar_state` cookie on
	 * toggle. `--sidebar-width*` overrides set the rail width (16.5rem / 17.5rem mobile).
	 */
	let { open = true, children }: { open?: boolean; children: Snippet } = $props();
</script>

<Sidebar.Provider
	{open}
	style="--sidebar-width: 16.5rem; --sidebar-width-mobile: 17.5rem;"
	class="min-h-svh"
>
	<AppSidebar />
	<Sidebar.Inset class="relative min-h-svh bg-background text-foreground">
		{@render children()}
	</Sidebar.Inset>
</Sidebar.Provider>

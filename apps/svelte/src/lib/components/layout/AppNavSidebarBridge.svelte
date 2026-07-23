<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { appNavSidebarContext } from './app-nav-sidebar.svelte';

	/**
	 * Re-publishes the AppShell left-nav sidebar under a stable context for page headers.
	 * Must wrap descendants (not sit as a sibling) — `setContext` only reaches children.
	 */
	let { children }: { children: Snippet } = $props();

	appNavSidebarContext.set(Sidebar.useSidebar());
</script>

{@render children()}

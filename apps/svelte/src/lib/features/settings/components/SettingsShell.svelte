<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import SettingsRail from './SettingsRail.svelte';

	/**
	 * Settings shell. Own `Sidebar.Provider` (distinct from the product AppShell) with the settings rail,
	 * a mobile-only sticky header (SidebarTrigger + "Pengaturan"), and a centered max-w-2xl content
	 * column. NavUser viewer resolves from `viewerContext`, so no profile prop is needed. Custom rail
	 * widths: 16.5 / 17.5rem.
	 */
	let { children }: { children: Snippet } = $props();
</script>

<Sidebar.Provider style="--sidebar-width: 16.5rem; --sidebar-width-mobile: 17.5rem;">
	<SettingsRail />
	<Sidebar.Inset class="min-h-svh bg-background text-foreground">
		<header
			class="sticky top-0 z-10 flex h-12 items-center gap-2 border-b border-border/60 bg-background/80 px-4 backdrop-blur md:hidden"
		>
			<Sidebar.Trigger class="-ml-1.5 size-8 text-muted-foreground" />
			<span class="text-[13px] font-medium text-foreground">Pengaturan</span>
		</header>
		<main class="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
			<div class="grid gap-6">{@render children()}</div>
		</main>
	</Sidebar.Inset>
</Sidebar.Provider>

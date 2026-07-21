<script lang="ts">
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import AppSidebar from './AppSidebar.svelte';

	let { open = true, children }: { open?: boolean; children: Snippet } = $props();

	const mobilePageLabel = $derived.by(() => {
		const { pathname } = page.url;
		if (pathname.startsWith('/app/projects/new')) return 'Proyek baru';
		if (pathname.startsWith('/app/projects')) return 'Proyek';
		if (pathname.startsWith('/app/library')) return 'Perpustakaan';
		if (pathname.startsWith('/app/explore')) return 'Jelajahi';
		return 'Beranda';
	});
</script>

<Sidebar.Provider
	{open}
	style="--sidebar-width: 16.5rem; --sidebar-width-mobile: 17.5rem; --sidebar-width-icon: 3rem;"
	class="min-h-svh"
>
	<AppSidebar />
	<Sidebar.Inset class="relative bg-background text-foreground">
		<header
			class="z-10 flex h-12 shrink-0 items-center gap-2 border-b border-border/60 bg-background/80 px-4 backdrop-blur md:hidden"
		>
			<Sidebar.Trigger class="-ml-1.5 size-8 text-muted-foreground" aria-label="Buka navigasi" />
			<span class="min-w-0 truncate text-[13px] font-medium text-foreground">
				{mobilePageLabel}
			</span>
		</header>
		<div class="flex min-h-0 flex-1 flex-col">{@render children()}</div>
	</Sidebar.Inset>
</Sidebar.Provider>

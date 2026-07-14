<script lang="ts">
	import { SidebarTrigger } from '$lib/components/ui/sidebar';

	// Phase-3 scaffolding stub so the shell nav links resolve and render inside the shell.
	// The real Settings surfaces (overview/account/appearance/…) land in Phase 5.
</script>

<div class="flex min-h-svh flex-col">
	<header class="flex h-11 shrink-0 items-center gap-2 px-5">
		<SidebarTrigger />
		<span class="text-sm font-medium text-foreground">Pengaturan</span>
	</header>
	<div class="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
		Pengaturan hadir di fase berikutnya.
	</div>
</div>

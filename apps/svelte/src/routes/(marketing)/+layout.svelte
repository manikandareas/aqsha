<script lang="ts">
	import type { Snippet } from 'svelte';
	import LandingHeader from '$lib/features/marketing/components/LandingHeader.svelte';
	import LandingFooter from '$lib/features/marketing/components/LandingFooter.svelte';

	// Chrome marketing bersama (header + footer) untuk semua halaman publik ber-chrome: landing, blog,
	// changelog. Route group `(marketing)` = URL-transparan (mis. `(marketing)/blog` → `/blog`). Padanan
	// gabungan web `landing-page` (yang render sendiri header/footer) + `app/{blog,changelog}/layout.tsx`
	// — di sini disatukan jadi satu sumber chrome (DRY). Halaman menyediakan `<main>`-nya sendiri.
	// sign-in/sign-up TIDAK di group ini (layout terpusat tanpa chrome).
	let { children }: { children: Snippet } = $props();
</script>

<div class="flex min-h-svh flex-col bg-background text-foreground">
	<LandingHeader />
	<div class="flex-1">{@render children()}</div>
	<LandingFooter />
</div>

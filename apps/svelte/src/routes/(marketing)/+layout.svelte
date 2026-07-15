<script lang="ts">
	import type { Snippet } from 'svelte';
	import LandingHeader from '$lib/features/marketing/components/LandingHeader.svelte';
	import LandingFooter from '$lib/features/marketing/components/LandingFooter.svelte';

	// Shared marketing chrome (header + footer) for public pages: landing, blog, changelog.
	// Route group `(marketing)` is URL-transparent (e.g. `(marketing)/blog` → `/blog`).
	// sign-in/sign-up are NOT in this group (centered layout without marketing chrome).
	let { children }: { children: Snippet } = $props();
</script>

<div class="flex min-h-svh flex-col bg-background text-foreground">
	<LandingHeader />
	<div class="flex-1">{@render children()}</div>
	<LandingFooter />
</div>

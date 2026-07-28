<script lang="ts">
	import LandingHeader from '$lib/features/marketing/components/LandingHeader.svelte';
	import LandingFooter from '$lib/features/marketing/components/LandingFooter.svelte';
	import MotionProvider from '$lib/components/layout/MotionProvider.svelte';
	import ThemeProvider from '$lib/components/layout/ThemeProvider.svelte';
	import type { LayoutProps } from './$types';

	// Shared marketing chrome (header + footer) for public pages: landing, blog, changelog.
	// Route group `(marketing)` is URL-transparent (e.g. `(marketing)/blog` → `/blog`).
	// sign-in/sign-up are NOT in this group (centered layout without marketing chrome).
	let { children }: LayoutProps = $props();
</script>

<ThemeProvider>
	<MotionProvider>
		<div class="flex min-h-svh flex-col bg-background text-foreground">
			<LandingHeader />
			<div class="flex-1">{@render children()}</div>
			<LandingFooter />
		</div>
	</MotionProvider>
</ThemeProvider>

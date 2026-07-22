<script lang="ts">
	import { ClerkProvider } from 'svelte-clerk';
	import { shadcn } from '@clerk/themes';
	import { publicEnv } from '$lib/env/public';
	import ThemeProvider from '$lib/components/layout/ThemeProvider.svelte';
	import type { LayoutProps } from './$types';

	// Shared auth chrome for the Clerk screens (sign-in, sign-up): a full-height centered surface.
	// Route group `(auth)` is URL-transparent — `(auth)/sign-in` still serves `/sign-in`, so
	// `hooks.server.ts` PUBLIC_PATTERNS and every internal link stay unchanged. This hoists the
	// identical `<main class="flex min-h-svh items-center justify-center …">` wrapper that sign-in
	// and sign-up each used to repeat, mirroring the DRY-chrome pattern already used by `(marketing)`.
	// `/onboarding` is deliberately NOT in this group: it renders full-bleed and has a different auth
	// gate (must not be onboarding-gated — see hooks.server.ts).
	let { children }: LayoutProps = $props();
</script>

<ClerkProvider
	publishableKey={publicEnv.PUBLIC_CLERK_PUBLISHABLE_KEY}
	appearance={{ theme: shadcn }}
>
	<ThemeProvider>
		<main class="flex min-h-svh items-center justify-center bg-background px-5 py-10">
			{@render children()}
		</main>
	</ThemeProvider>
</ClerkProvider>

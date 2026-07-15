<script lang="ts">
	import type { Snippet } from 'svelte';

	// Shared auth chrome for the Clerk screens (sign-in, sign-up): a full-height centered surface.
	// Route group `(auth)` is URL-transparent — `(auth)/sign-in` still serves `/sign-in`, so
	// `hooks.server.ts` PUBLIC_PATTERNS and every internal link stay unchanged. This hoists the
	// identical `<main class="flex min-h-svh items-center justify-center …">` wrapper that sign-in
	// and sign-up each used to repeat, mirroring the DRY-chrome pattern already used by `(marketing)`.
	// `/onboarding` is deliberately NOT in this group: it renders full-bleed and has a different auth
	// gate (must not be onboarding-gated — see hooks.server.ts).
	let { children }: { children: Snippet } = $props();
</script>

<main class="flex min-h-svh items-center justify-center bg-background px-5 py-10">
	{@render children()}
</main>

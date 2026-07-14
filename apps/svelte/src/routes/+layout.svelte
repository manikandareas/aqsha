<script lang="ts">
	import '../app.css';
	import type { Snippet } from 'svelte';
	import { ClerkProvider } from 'svelte-clerk';
	import { QueryClientProvider } from '@tanstack/svelte-query';
	import { env } from '$env/dynamic/public';
	import { createQueryClient } from '$lib/query/client';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	// Per-request QueryClient (plan §3.5): this <script> runs once per SSR request on the server —
	// never a module-level singleton, which would leak server-state across users.
	const queryClient = createQueryClient();
</script>

<svelte:head>
	<link rel="icon" href="/favicon.ico" sizes="any" />
	<link rel="icon" type="image/png" href="/icon.png" />
	<link rel="apple-touch-icon" href="/apple-icon.png" />
</svelte:head>

<!-- `{...data}` (not initialState={...}) is the svelte-clerk quickstart pattern: the exported
     ClerkProvider type omits `initialState`, but the runtime reads it; object spread bypasses the
     excess-property check the way `<ClerkProvider {...buildClerkProps(...)}>` is meant to. -->
<ClerkProvider {...data} publishableKey={env.PUBLIC_CLERK_PUBLISHABLE_KEY}>
	<QueryClientProvider client={queryClient}>
		{@render children()}
	</QueryClientProvider>
</ClerkProvider>

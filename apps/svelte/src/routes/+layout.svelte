<script lang="ts">
	import '../app.css';
	import type { Snippet } from 'svelte';
	import { ClerkProvider } from 'svelte-clerk';
	import { shadcn } from '@clerk/themes';
	import { QueryClientProvider } from '@tanstack/svelte-query';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import { publicEnv } from '$lib/env/public';
	import { createQueryClient } from '$lib/query';
	import AppProviders from '$lib/components/layout/AppProviders.svelte';
	import ThemeProvider from '$lib/components/layout/ThemeProvider.svelte';
	import OnboardingGate from '$lib/components/layout/OnboardingGate.svelte';
	import MotionProvider from '$lib/components/layout/MotionProvider.svelte';
	import AppToaster from '$lib/components/layout/AppToaster.svelte';
	import { defaultDescription, siteName } from '$lib/seo/config';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	// Per-request QueryClient: this <script> runs once per SSR request on the server —
	// never a module-level singleton, which would leak server-state across users.
	const queryClient = createQueryClient();
</script>

<svelte:head>
	<!-- Default document title + description. Any page/shell that renders `<title>` deeper in the tree
	     overrides this (Svelte keeps a single title; deepest/last wins). Pages behind auth use `PageTitle`;
	     public/marketing pages use `SeoHead`. Without this, un-titled pages would have no `<title>`. -->
	<title>{siteName}</title>
	<meta name="description" content={defaultDescription} />
	<link rel="icon" href="/favicon.ico" sizes="any" />
	<link rel="icon" type="image/png" href="/icon.png" />
	<link rel="apple-touch-icon" href="/apple-icon.png" />
	<link rel="manifest" href="/manifest.webmanifest" />
</svelte:head>

<!-- Provider order: Clerk > Query > (runtime api/viewer + UserSync) > Theme > OnboardingGate > Motion >
     Tooltip > page. AppToaster is a sibling of OnboardingGate inside ThemeProvider so toasts render
     during the onboarding-gate loading window. `{...data}` = svelte-clerk initialState spread. -->
<ClerkProvider
	{...data}
	publishableKey={publicEnv.PUBLIC_CLERK_PUBLISHABLE_KEY}
	appearance={{ theme: shadcn }}
>
	<QueryClientProvider client={queryClient}>
		<AppProviders>
			<ThemeProvider>
				<OnboardingGate>
					<MotionProvider>
						<Tooltip.Provider>
							{@render children()}
						</Tooltip.Provider>
					</MotionProvider>
				</OnboardingGate>
				<AppToaster />
			</ThemeProvider>
		</AppProviders>
	</QueryClientProvider>
</ClerkProvider>

<script lang="ts">
	import { ClerkProvider } from 'svelte-clerk';
	import { shadcn } from '@clerk/themes';
	import { QueryClientProvider } from '@tanstack/svelte-query';
	import * as Tooltip from '@aqsha/ui-svelte/components/tooltip';
	import { publicEnv } from '$lib/env/public';
	import { createQueryClient, QueryHydrationBoundary } from '$lib/query';
	import AppProviders from '$lib/components/layout/AppProviders.svelte';
	import AppToaster from '$lib/components/layout/AppToaster.svelte';
	import MotionProvider from '$lib/components/layout/MotionProvider.svelte';
	import ThemeProvider from '$lib/components/layout/ThemeProvider.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
	const queryClient = createQueryClient();
</script>

<ClerkProvider
	publishableKey={publicEnv.PUBLIC_CLERK_PUBLISHABLE_KEY}
	appearance={{ theme: shadcn }}
>
	<QueryClientProvider client={queryClient}>
		<QueryHydrationBoundary state={data.bootstrap.critical}>
			<AppProviders>
				<ThemeProvider>
					<MotionProvider>
						<Tooltip.Provider>
							{@render children()}
						</Tooltip.Provider>
					</MotionProvider>
					<AppToaster />
				</ThemeProvider>
			</AppProviders>
		</QueryHydrationBoundary>
	</QueryClientProvider>
</ClerkProvider>

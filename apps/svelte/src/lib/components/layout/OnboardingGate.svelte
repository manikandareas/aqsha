<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { createQuery } from '@tanstack/svelte-query';
	import { getApiClient } from '$lib/api';
	import { queryKeys, unwrap } from '$lib/query';
	import AppLoadingOverlay from './AppLoadingOverlay.svelte';

	/**
	 * Client onboarding gate — the UX (loading-overlay) half. The authoritative redirect for un-onboarded
	 * `/app` users is the server gate in `hooks.server.ts` (no flash); this overlay covers the
	 * client-side window while the status query resolves and redirects if onboarding is incomplete.
	 * Query args wrapped in a function so TanStack Query stays reactive.
	 */
	let { children }: { children: Snippet } = $props();

	const api = getApiClient();
	const status = createQuery(() => ({
		queryKey: queryKeys.onboarding.status(),
		queryFn: async () => unwrap(await api.onboarding.status.get())
	}));

	const pathname = $derived(page.url.pathname);
	const inApp = $derived(pathname.startsWith('/app'));
	const needsOnboarding = $derived(
		inApp && !pathname.startsWith('/onboarding') && !!status.data && !status.data.completed
	);

	$effect(() => {
		if (needsOnboarding) {
			void goto(resolve('/onboarding'), { replaceState: true });
		}
	});
</script>

{#if inApp && status.isLoading}
	<AppLoadingOverlay label="Menyiapkan akun..." />
{:else if needsOnboarding}
	<AppLoadingOverlay label="Menyiapkan onboarding..." />
{:else}
	{@render children()}
{/if}

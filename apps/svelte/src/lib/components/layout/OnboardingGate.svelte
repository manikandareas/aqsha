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
	 * Client onboarding gate — the UX (loading-overlay) half, ported from
	 * apps/web/components/onboarding-gate.tsx. The AUTHORITATIVE redirect for un-onboarded
	 * `/app` users is the SERVER gate in `hooks.server.ts` (Phase 2, FND-8, no flash); this
	 * overlay covers the client-side window while the status query resolves and mirrors the
	 * belt-and-suspenders client redirect. Query args wrapped in a function (§3.6).
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

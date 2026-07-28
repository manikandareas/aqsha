<script lang="ts">
	import type { Snippet } from 'svelte';
	import { useClerkContext } from 'svelte-clerk';
	import { apiClientContext, createBrowserApiClient } from '$lib/api';
	import { clerkTokenGetter } from '$lib/auth/token';
	import { UserSync, ViewerIdentityState, viewerContext } from '$lib/auth';

	/**
	 * Runtime providers — child `<ClerkProvider>`+`<QueryClientProvider>`, jadi `useClerkContext()`
	 * sudah tersedia (parent set context saat init, sebelum child dibuat). Membangun Eden client
	 * ber-auth + viewer state per-request (bukan singleton module), memasangnya ke context untuk
	 * feature, dan menjalankan user-sync.
	 */
	let { children, syncUser = true }: { children: Snippet; syncUser?: boolean } = $props();

	const clerk = useClerkContext();

	// Eden client ber-auth (token per-request via clerkTokenGetter) → context.
	apiClientContext.set(createBrowserApiClient(clerkTokenGetter(clerk)));

	// Viewer identity reaktif → context. Base viewer dari API di-set saat data profil termuat;
	// Clerk user mengisi identitas dasar sekarang.
	viewerContext.set(new ViewerIdentityState());
</script>

{#if syncUser}
	<UserSync />
{/if}
{@render children()}

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { useClerkContext } from 'svelte-clerk';
	import { apiClientContext, createBrowserApiClient } from '$lib/api';
	import { clerkTokenGetter } from '$lib/auth/token';
	import { UserSync, ViewerIdentityState, viewerContext } from '$lib/auth';

	/**
	 * Runtime providers — child `<ClerkProvider>`+`<QueryClientProvider>`, jadi `useClerkContext()`
	 * sudah tersedia (parent set context saat init, sebelum child dibuat). Membangun Eden client
	 * ber-auth + viewer state PER-REQUEST (bukan singleton module — §3.5), memasangnya ke context untuk
	 * feature, dan menjalankan user-sync. Padanan gabungan provider `apps/web/app/layout.tsx`.
	 */
	let { children }: { children: Snippet } = $props();

	const clerk = useClerkContext();

	// Eden client ber-auth (token per-request via clerkTokenGetter) → context (padanan `useApi()`).
	apiClientContext.set(createBrowserApiClient(clerkTokenGetter(clerk)));

	// Viewer identity reaktif → context (padanan `useResolvedViewer`/`useViewerDisplay`). Base viewer
	// dari API di-set saat data profil termuat (Phase 3); Clerk user mengisi identitas dasar sekarang.
	viewerContext.set(new ViewerIdentityState());
</script>

<UserSync />
{@render children()}

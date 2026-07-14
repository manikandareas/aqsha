<script lang="ts">
	import { browser } from '$app/environment';
	import { getApiClient } from '$lib/api';
	import { getAuthState } from './context.svelte';

	/**
	 * Provisioning sekali per `userId`: `POST /users/me/sync` (idempotent server-side). Port
	 * `apps/web/components/authenticated-user-sync.tsx`. Merender null; dipasang di `AppProviders`.
	 *
	 * Runes-note: `userId`/`isLoaded` di-extract ke `$derived` PRIMITIF (temuan Phase 1 b) — membaca
	 * `auth.userId` langsung di `$effect` akan re-run tiap churn token (objek `clerk.auth` rebuild);
	 * `$derived` primitif menggerbang re-run dgn equality string. `$effect` di sini = escape-hatch sah:
	 * fire-and-forget ke sistem eksternal saat identitas berubah (bukan turunan state).
	 */
	const auth = getAuthState();
	const api = getApiClient();

	const userId = $derived(auth.userId);
	const isLoaded = $derived(auth.isLoaded);

	// Dedupe per-instance (padanan useRef StrictMode) + sessionStorage (navigasi dalam tab). Bukan
	// module-level state (§3.5).
	let syncedFor: string | null = null;

	$effect(() => {
		if (!browser || !isLoaded || !userId) return;
		if (syncedFor === userId) return;

		const key = `aqsha:synced:${userId}`;
		if (window.sessionStorage.getItem(key)) {
			syncedFor = userId;
			return;
		}

		syncedFor = userId;
		void api.users.me.sync.post().then(({ error }) => {
			if (error) {
				syncedFor = null; // izinkan retry pada re-run berikutnya
			} else {
				window.sessionStorage.setItem(key, '1');
			}
		});
	});
</script>

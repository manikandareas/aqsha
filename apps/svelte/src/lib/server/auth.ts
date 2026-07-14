import { redirect, type RequestEvent } from '@sveltejs/kit';
import { publicEnv } from '$lib/env/public';
import type { TokenGetter } from '$lib/auth/token';
import { createServerApiClient, type ServerApiClient } from './api';

/**
 * Auth facade sisi SERVER (plan §Phase 2 task 3). Semua akses auth server melewati facade ini —
 * jangan sebar API `svelte-clerk`/`locals.auth` mentah ke `load`/route. Padanan sisi client =
 * `$lib/auth` (`getAuthState`, dsb).
 */

type SessionAuth = ReturnType<App.Locals['auth']>;

/** Snapshot auth request-scoped (`userId`, `sessionId`, `getToken`, …). */
export function getAuth(event: RequestEvent): SessionAuth {
	return event.locals.auth();
}

/** True bila request punya sesi Clerk aktif. */
export function isSignedIn(event: RequestEvent): boolean {
	return Boolean(event.locals.auth().userId);
}

/** Token getter per-request (fresh tiap panggil) untuk Eden/Mastra dari server. */
export function getServerToken(event: RequestEvent): TokenGetter {
	return () => event.locals.auth().getToken();
}

/**
 * Wajib login: return `userId` atau `redirect(303 → sign-in)`. `redirect()` melempar, jadi tak
 * pernah return saat unauth. Dipakai `load`/`+server` yang butuh user pasti.
 */
export function requireUser(event: RequestEvent): string {
	const { userId } = event.locals.auth();
	if (!userId) redirect(303, publicEnv.PUBLIC_CLERK_SIGN_IN_URL);
	return userId;
}

/** Eden client ber-auth terikat ke sesi request ini. */
export function serverApiFor(event: RequestEvent): ServerApiClient {
	return createServerApiClient(getServerToken(event));
}

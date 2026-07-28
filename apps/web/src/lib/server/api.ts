import { createApiClient } from '@aqsha/api/client';
import { publicEnv } from '$lib/env/public';
import type { TokenGetter } from '$lib/auth/token';

/**
 * Eden Treaty client ber-auth untuk sisi server (`load`/`+*.server.ts`/hooks). Token Clerk di-scope
 * per-request lewat `getToken` (bukan singleton module-level — cegah kebocoran token lintas request
 * pada satu proses Node).
 *
 * Sumber token = `event.locals.auth().getToken()` (lihat `$lib/server/auth`). Beda dari `handleFetch`
 * di `hooks.server.ts`: `handleFetch` menyuntik token untuk `event.fetch` di `load`; client ini
 * menyuntik langsung via `getToken` untuk pemanggilan Eden dari hooks/server (mis. onboarding gate).
 * `App` type-only → tak menarik runtime server ke bundle.
 */
export function createServerApiClient(getToken: TokenGetter) {
	return createApiClient(publicEnv.PUBLIC_API_URL, getToken);
}

export type ServerApiClient = ReturnType<typeof createServerApiClient>;

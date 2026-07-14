import { createApiClient } from '@aqsha/api/client';
import { publicEnv } from '$lib/env/public';
import type { TokenGetter } from '$lib/auth/token';

/**
 * Authenticated Eden Treaty client. Reuses `@aqsha/api`'s `createApiClient` (type-safe over the
 * shared `App` type — no codegen, no server runtime in the bundle: the `App` import is type-only).
 * `getToken` injects a fresh `Authorization: Bearer` per request. Identical contract to
 * `apps/web/lib/api-client.ts`, minus React. Base URL from the typed `publicEnv` (§3.7).
 */
export function createBrowserApiClient(getToken: TokenGetter) {
	return createApiClient(publicEnv.PUBLIC_API_URL, getToken);
}

export type BrowserApiClient = ReturnType<typeof createBrowserApiClient>;

import { createApiClient } from '@aqsha/api/client';
import { env } from '$env/dynamic/public';
import type { TokenGetter } from '$lib/auth/token';

/**
 * Authenticated Eden Treaty client. Reuses `@aqsha/api`'s `createApiClient` (type-safe over the
 * shared `App` type — no codegen, no server runtime in the bundle: the `App` import is type-only).
 * `getToken` injects a fresh `Authorization: Bearer` per request. Identical contract to
 * `apps/web/lib/api-client.ts`, minus React.
 */
export function createBrowserApiClient(getToken: TokenGetter) {
	const baseUrl = env.PUBLIC_API_URL ?? 'http://localhost:3001';
	return createApiClient(baseUrl, getToken);
}

export type BrowserApiClient = ReturnType<typeof createBrowserApiClient>;

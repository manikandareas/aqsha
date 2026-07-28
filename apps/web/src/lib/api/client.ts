import { createApiClient } from '@aqsha/api/client';
import { publicEnv } from '$lib/env/public';
import type { TokenGetter } from '$lib/auth/token';

/**
 * Authenticated Eden Treaty client. Type-safe over the shared `App` type (type-only import — no
 * server runtime in the bundle). `getToken` injects a fresh `Authorization: Bearer` per request.
 * Base URL from typed `publicEnv`.
 */
export function createBrowserApiClient(getToken: TokenGetter) {
	return createApiClient(publicEnv.PUBLIC_API_URL, getToken);
}

export type BrowserApiClient = ReturnType<typeof createBrowserApiClient>;

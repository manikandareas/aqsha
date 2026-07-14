import { createContext } from '$lib/context';
import type { BrowserApiClient } from './client';

/**
 * Context Eden client ber-auth (padanan `useApi()` di web). Di-set sekali di `AppProviders` (child
 * `<ClerkProvider>`), dibaca feature via `getApiClient()`. Per-tree (bukan module singleton, §3.5).
 */
export const apiClientContext = createContext<BrowserApiClient>('api-client');

/** Ambil Eden client dari context. Throw bila dipanggil di luar `AppProviders`. */
export function getApiClient(): BrowserApiClient {
	return apiClientContext.get();
}

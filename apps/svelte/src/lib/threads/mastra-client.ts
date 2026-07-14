import { MastraClient } from '@mastra/client-js';
import type { TokenGetter } from '$lib/auth/token';

/** Mastra agent id (key in `new Mastra({ agents })`) — see `apps/agent/src/mastra/index.ts`. */
export const ASTRA_AGENT_ID = 'astra-lite';

/**
 * `@mastra/client-js` pointed same-origin at the `/mastra-api/*` proxy
 * (`routes/mastra-api/[...path]/+server.ts`) → server Mastra `@aqsha/agent`. The Clerk bearer is
 * injected FRESH per request via the custom `fetch` (short-lived token); the agent's
 * `server.auth` (MastraAuthClerk) verifies it. Mirror of `apps/web/features/threads/lib/mastra-client.ts`.
 */
export function createMastraClient(getToken: TokenGetter): MastraClient {
	return new MastraClient({
		baseUrl: typeof window !== 'undefined' ? window.location.origin : '',
		apiPrefix: '/mastra-api',
		fetch: async (input, init) => {
			const token = await getToken();
			const headers = new Headers(init?.headers);
			if (token) headers.set('authorization', `Bearer ${token}`);
			return fetch(input as RequestInfo, { ...init, headers });
		}
	});
}

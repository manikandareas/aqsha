import { MastraClient } from '@mastra/client-js';
import type { AgentKind } from '@aqsha/chat-core';
import type { TokenGetter } from '$lib/auth/token';

/** Astra agent tier — one contract in `@aqsha/chat-core`, re-exported for lib threads consumers. */
export type { AgentKind };

/** Mastra agent id (key in `new Mastra({ agents })`) — see `apps/agent/src/mastra/index.ts`. */
export const ASTRA_AGENT_ID = 'astra-lite';
const ASTRA_PRO_AGENT_ID = 'astra-pro';

/**
 * Agent id per tier. The Mastra `sendMessage`/`subscribeToThread` routes are AGENT-SCOPED
 * (`/agents/:id/...`) → a Pro turn flows on the `astra-pro` channel, so a thread subscription MUST
 * point at the same agent as the active turn (see `committedAgentKind` in the thread-agent state).
 * Verbatim port of `apps/web/features/threads/lib/mastra-client.ts` `agentIdFor`.
 */
export function agentIdFor(agentKind: AgentKind): string {
	return agentKind === 'pro' ? ASTRA_PRO_AGENT_ID : ASTRA_AGENT_ID;
}

/**
 * `@mastra/client-js` pointed same-origin at the `/mastra-api/*` proxy
 * (`routes/mastra-api/[...path]/+server.ts`, FND-11) → the Mastra server `@aqsha/agent`. A FRESH Clerk
 * bearer is injected per request via the custom `fetch` (short-lived token), not a static header; the
 * agent's `server.auth` (MastraAuthClerk) verifies it. Stop is NOT an AbortController here — the
 * durable thread uses server-side cancel (`abortThread`) so the subscription/run is decoupled from the
 * fetch connection. Mirror of `apps/web/features/threads/lib/mastra-client.ts` `useMastraClient`.
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

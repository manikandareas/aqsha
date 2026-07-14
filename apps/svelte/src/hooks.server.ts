import { withClerkHandler } from 'svelte-clerk/server';
import { sequence } from '@sveltejs/kit/hooks';
import { redirect, type Handle, type HandleFetch } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';

// Auth boundary (plan §2 `lib/auth`, dealbreaker #1). svelte-clerk reads CLERK_SECRET_KEY /
// PUBLIC_CLERK_PUBLISHABLE_KEY via `$env/dynamic/*` internally (verified in dist) — aligned with
// §3.7 (Infisical injects env at runtime, so never `$env/static/*`).

const clerk = withClerkHandler();

/**
 * Server-side gate for protected `/app` routes (mirror of `apps/web/proxy.ts` `clerkMiddleware`).
 * `/mastra-api/*` and `/sign-in` stay public — the proxy carries its own bearer, verified by the
 * agent's `server.auth`. Runs AFTER `clerk` in the sequence, so `locals.auth()` is populated.
 */
const protect: Handle = async ({ event, resolve }) => {
	if (event.url.pathname.startsWith('/app')) {
		const { userId } = event.locals.auth();
		if (!userId) redirect(303, '/sign-in');
	}
	return resolve(event);
};

export const handle = sequence(clerk, protect);

/**
 * Server-side authenticated fetch (plan §3.6): inject the Clerk token for calls to our API origin
 * made from `load`/`+*.server.ts`. This is the SSR half of getToken-per-request (the client half is
 * `clerkTokenGetter`). Reusable in Phase 2 for any SSR-first data fetch; the slice itself fetches
 * client-side, but wiring this proves the SSR token path (dealbreaker #1).
 */
export const handleFetch: HandleFetch = async ({ event, request, fetch }) => {
	const apiBase = env.PUBLIC_API_URL;
	if (apiBase && request.url.startsWith(apiBase)) {
		const token = await event.locals.auth().getToken();
		if (token) request.headers.set('authorization', `Bearer ${token}`);
	}
	return fetch(request);
};

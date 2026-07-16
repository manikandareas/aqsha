import * as Sentry from '@sentry/sveltekit';
import { sequence } from '@sveltejs/kit/hooks';
import { redirect, type Handle, type HandleFetch, type HandleServerError } from '@sveltejs/kit';
import { withClerkHandler } from 'svelte-clerk/server';
import { serverEnv } from '$lib/server/env';
import { publicEnv } from '$lib/env/public';
import { createServerApiClient } from '$lib/server/api';
import { initServerSentry } from '$lib/observability';
import { seoAllowIndexing } from '$lib/seo/config';

// Boot: importing `$lib/server/env` runs zod validation for all env (PUBLIC + PRIVATE);
// invalid env throws at server start. Then init Sentry server SDK.
initServerSentry(serverEnv);

// Auth boundary via svelte-clerk (reads CLERK_SECRET_KEY / PUBLIC_CLERK_PUBLISHABLE_KEY).
const clerk = withClerkHandler();

/**
 * Public routes — unauthenticated allow-list. `/mastra-api` is excluded from the gate: it proxies to
 * the Mastra agent server which has its own auth (MastraAuthClerk). Gating here would 303-redirect
 * streams instead of returning 401.
 */
const PUBLIC_PATTERNS: RegExp[] = [
	/^\/$/,
	/^\/sign-in(?:\/.*)?$/,
	/^\/sign-up(?:\/.*)?$/,
	/^\/blog(?:\/.*)?$/,
	/^\/changelog(?:\/.*)?$/,
	/^\/sitemap\.xml$/,
	/^\/robots\.txt$/,
	/^\/manifest\.webmanifest$/,
	/^\/sentry-tunnel(?:\/.*)?$/,
	// Component showcase; its load() 404s outside dev, so the allow-list entry is inert in prod.
	/^\/design-lab(?:\/.*)?$/
];

function isPublicPath(pathname: string): boolean {
	return PUBLIC_PATTERNS.some((re) => re.test(pathname));
}

function isAgentProxyPath(pathname: string): boolean {
	return pathname === '/mastra-api' || pathname.startsWith('/mastra-api/');
}

/**
 * Auth + onboarding gate. Runs AFTER `clerk` → `locals.auth` is populated. Non-public routes require
 * a session; `/app` also requires completed onboarding (redirect before render, no flash). `/onboarding`
 * sits outside `/app` → session only, not onboarding-gated (prevents redirect loop).
 */
const guard: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	if (isAgentProxyPath(path) || isPublicPath(path)) return resolve(event);

	const { userId, getToken } = event.locals.auth();
	if (!userId) redirect(303, publicEnv.PUBLIC_CLERK_SIGN_IN_URL);

	if ((path === '/app' || path.startsWith('/app/')) && !event.isSubRequest) {
		let needsOnboarding = false;
		try {
			const api = createServerApiClient(() => getToken());
			const { data } = await api.onboarding.status.get();
			needsOnboarding = Boolean(data && !data.completed);
		} catch {
			// Transient error (API blip) → do not block /app; redirect only on positive `!completed`.
		}
		// redirect() di luar try agar throw-nya tak tertelan catch.
		if (needsOnboarding) redirect(303, '/onboarding');
	}

	return resolve(event);
};

/**
 * Security headers + preview noindex. Innermost so headers apply to the final rendered response
 * (redirects from guard do not need these). CSP is not tightened (Clerk/Sentry/streamdown risk).
 * Content sanitization = trusted MDX build-time (Content Collections) + Svelte default escaping.
 */
const securityHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('X-Frame-Options', 'SAMEORIGIN');
	// Preview deployment: cegah index sampai cutover (flip domain set PUBLIC_SEO_ALLOW_INDEXING=true).
	if (!seoAllowIndexing) response.headers.set('X-Robots-Tag', 'noindex, nofollow');
	return response;
};

// sentryHandle FIRST (trace seluruh request termasuk handler kita), lalu clerk, guard, headers.
export const handle = sequence(Sentry.sentryHandle(), clerk, guard, securityHeaders);

/**
 * Server-side authenticated fetch: inject Clerk token for `event.fetch` calls to our API origin from
 * `load`/`+*.server.ts`. SSR counterpart to client `getAuthToken`.
 */
export const handleFetch: HandleFetch = async ({ event, request, fetch }) => {
	const apiBase = publicEnv.PUBLIC_API_URL;
	if (apiBase && request.url.startsWith(apiBase)) {
		const token = await event.locals.auth().getToken();
		if (token) request.headers.set('authorization', `Bearer ${token}`);
	}
	return fetch(request);
};

/** Unexpected server error → Sentry + shape `App.Error` for `+error.svelte`. */
const handleServerError: HandleServerError = ({ error }) => {
	console.error('[svelte:server] unexpected error', error);
	return { message: 'Terjadi kesalahan tak terduga.', code: 'unexpected' };
};

export const handleError = Sentry.handleErrorWithSentry(handleServerError);

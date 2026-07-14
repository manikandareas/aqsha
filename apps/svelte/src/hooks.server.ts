import * as Sentry from '@sentry/sveltekit';
import { sequence } from '@sveltejs/kit/hooks';
import { redirect, type Handle, type HandleFetch, type HandleServerError } from '@sveltejs/kit';
import { withClerkHandler } from 'svelte-clerk/server';
import { serverEnv } from '$lib/server/env';
import { publicEnv } from '$lib/env/public';
import { createServerApiClient } from '$lib/server/api';
import { initServerSentry } from '$lib/observability';
import { seoAllowIndexing } from '$lib/seo/config';

// Boot (§3.7 fail-fast): mengimpor `$lib/server/env` sudah menjalankan validasi zod SEMUA env
// (PUBLIC + PRIVATE); env salah → throw saat server start. Lalu init Sentry server SDK.
initServerSentry(serverEnv);

// Auth boundary (plan §2 `lib/auth`). svelte-clerk membaca CLERK_SECRET_KEY /
// PUBLIC_CLERK_PUBLISHABLE_KEY via `$env/dynamic/*` internal — selaras §3.7 (Infisical runtime).
const clerk = withClerkHandler();

/**
 * Public routes — mirror `apps/web/proxy.ts` `isPublicRoute`. proxy.ts memproteksi SEMUA route
 * kecuali allow-list ini; kita menegakkan hal sama di `guard`. `/mastra-api` di-EXCLUDE dari gate:
 * ia proxy ke server agent Mastra yang punya auth sendiri (MastraAuthClerk) — meng-gate di sini akan
 * 303-redirect stream (bukan 401). Biarkan runtime agent yang auth.
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
	/^\/sentry-tunnel(?:\/.*)?$/
];

function isPublicPath(pathname: string): boolean {
	return PUBLIC_PATTERNS.some((re) => re.test(pathname));
}

function isAgentProxyPath(pathname: string): boolean {
	return pathname === '/mastra-api' || pathname.startsWith('/mastra-api/');
}

/**
 * Gate auth + onboarding (mirror `proxy.ts` + `app/app/layout.tsx`). Runs AFTER `clerk` → `locals.auth`
 * terisi. Semua route non-public butuh sesi; `/app` juga butuh onboarding selesai (redirect SEBELUM
 * render, no flash). `/onboarding` di luar `/app` → hanya butuh sesi, tak ter-gate onboarding (cegah loop).
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
			// Transient error (API blip) → jangan blok /app; render (parity web gate: redirect HANYA
			// saat positif `!completed`). `needsOnboarding` tetap false → tak redirect.
		}
		// redirect() di luar try agar throw-nya tak tertelan catch.
		if (needsOnboarding) redirect(303, '/onboarding');
	}

	return resolve(event);
};

/**
 * Security headers + preview-noindex (§10 Phase 4 task 7). `apps/web` tak menyetel header/CSP/redirect
 * (next.config.ts kosong dari itu) → tak ada yang di-port; ini hardening baseline additif + gate index.
 * Innermost supaya berjalan atas respons yang benar-benar dirender (redirect guard tak butuh header ini).
 * CSP tak diperketat (parity web yang tak punya CSP; risiko pecah Clerk/Sentry/streamdown). Sanitasi
 * konten = MDX build-time trusted (Content Collections) + escaping default Svelte.
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
 * Server-side authenticated fetch (§3.6): suntik token Clerk untuk panggilan `event.fetch` ke origin
 * API kita dari `load`/`+*.server.ts`. Sisi SSR dari getToken-per-request (sisi client = `getAuthToken`).
 */
export const handleFetch: HandleFetch = async ({ event, request, fetch }) => {
	const apiBase = publicEnv.PUBLIC_API_URL;
	if (apiBase && request.url.startsWith(apiBase)) {
		const token = await event.locals.auth().getToken();
		if (token) request.headers.set('authorization', `Bearer ${token}`);
	}
	return fetch(request);
};

/** Unexpected server error → Sentry + shape `App.Error` untuk `+error.svelte`. Plan §Phase 2 task 7. */
const handleServerError: HandleServerError = ({ error }) => {
	console.error('[svelte:server] unexpected error', error);
	return { message: 'Terjadi kesalahan tak terduga.', code: 'unexpected' };
};

export const handleError = Sentry.handleErrorWithSentry(handleServerError);

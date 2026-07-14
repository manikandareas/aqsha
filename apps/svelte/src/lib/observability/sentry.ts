import * as Sentry from '@sentry/sveltekit';
import type { PublicEnv } from '$lib/env/defaults';
import type { PrivateEnv } from '$lib/env/schema';

/**
 * Konfigurasi Sentry SvelteKit (plan §Phase 2 task 7) — port semantik `apps/web` Sentry config.
 * `Sentry.init` di sini (bukan lewat vite plugin) supaya SDK aktif tanpa bergantung plugin, yang di
 * `vite.config.ts` HANYA opsional untuk upload source map. `@sentry/sveltekit` isomorphic: Vite
 * memilih SDK browser untuk `hooks.client`, SDK node untuk `hooks.server`.
 *
 * Kebijakan (mirror web): DSN kosong → SDK no-op; tracing default 0 (kuota); `sendDefaultPii:false`
 * (jangan auto-attach header/cookie/IP/PII); release/environment env-driven (Infisical, §3.7).
 */

/** Path tunnel same-origin (di-allowlist public di `hooks.server.ts`, mirror web `tunnelRoute`). */
export const SENTRY_TUNNEL_PATH = '/sentry-tunnel';

/** Init Sentry sisi CLIENT (browser). Dipanggil di `hooks.client.ts`. */
export function initClientSentry(env: PublicEnv): void {
	const dsn = env.PUBLIC_SENTRY_DSN;
	Sentry.init({
		dsn: dsn ?? undefined,
		enabled: Boolean(dsn),
		environment: env.PUBLIC_SENTRY_ENVIRONMENT,
		// Client tracing off (parity web client). Route ingest lewat tunnel same-origin agar
		// ad/tracker blocker tak diam-diam men-drop error envelope.
		tracesSampleRate: 0,
		tunnel: dsn ? SENTRY_TUNNEL_PATH : undefined,
		sendDefaultPii: false
	});
}

/** Init Sentry sisi SERVER (node/adapter-node). Dipanggil di `hooks.server.ts`. */
export function initServerSentry(env: PrivateEnv): void {
	const dsn = env.SENTRY_DSN;
	Sentry.init({
		dsn: dsn ?? undefined,
		enabled: Boolean(dsn),
		environment: env.SENTRY_ENVIRONMENT,
		tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
		release: env.SENTRY_RELEASE ?? undefined,
		sendDefaultPii: false
	});
}

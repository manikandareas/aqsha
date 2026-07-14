/**
 * Helper Sentry pure (tanpa SDK import) — dipisah dari `sentry.ts` supaya env schema & tunnel
 * dapat memakainya tanpa menarik `@sentry/sveltekit` ke graph-nya. Unit-testable.
 */

/**
 * `SENTRY_TRACES_SAMPLE_RATE` harus angka finite di [0,1]; invalid/NaN/out-of-range → `fallback`
 * (default 0). Nilai valid di-clamp, bukan ditolak — env salah tak pernah menaikkan ingest di luar
 * kuota. Port dari `apps/web/lib/sentry-config.ts` (logika sengaja identik dengan `@aqsha/db`).
 */
export function parseSampleRate(raw: string | undefined | null, fallback = 0): number {
	if (raw == null || raw === '') return fallback;
	const n = Number(raw);
	if (!Number.isFinite(n)) return fallback;
	return Math.min(1, Math.max(0, n));
}

export type ParsedSentryDsn = {
	/** host+port ingest, mis. `o123.ingest.us.sentry.io`. */
	host: string;
	/** project id (segmen terakhir path DSN). */
	projectId: string;
	/** URL envelope ingest untuk tunnel forwarding. */
	ingestUrl: string;
};

/**
 * Parse DSN Sentry (`https://<publicKey>@<host>/<projectId>`) → target ingest untuk tunnel
 * `+server.ts`. Return `null` bila DSN kosong/tak valid (tunnel lalu no-op, tak crash). Pure.
 */
export function parseSentryDsn(dsn: string | null | undefined): ParsedSentryDsn | null {
	if (!dsn) return null;
	let url: URL;
	try {
		url = new URL(dsn);
	} catch {
		return null;
	}
	const projectId = url.pathname.replace(/^\/+/, '').split('/').filter(Boolean).pop();
	if (!projectId || !url.username) return null;
	return {
		host: url.host,
		projectId,
		ingestUrl: `${url.protocol}//${url.host}/api/${projectId}/envelope/`
	};
}

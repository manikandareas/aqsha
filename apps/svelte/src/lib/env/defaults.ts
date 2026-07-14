/**
 * Default + type env PUBLIC — pure, TANPA zod & TANPA `$env` (aman di client bundle). Nilai default
 * hidup SEKALI di sini; `schema.ts` (server/test) mem-validasinya dgn zod, `public.ts` (client)
 * memakainya untuk akses bertipe. Semua nilai runtime → `$env/dynamic/*` (§3.7), bukan `$env/static/*`.
 */

export const PUBLIC_ENV_DEFAULTS = {
	PUBLIC_CLERK_SIGN_IN_URL: '/sign-in',
	PUBLIC_CLERK_SIGN_UP_URL: '/sign-up',
	PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: '/app',
	PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: '/app',
	PUBLIC_API_URL: 'http://localhost:3001',
	PUBLIC_SENTRY_ENVIRONMENT: 'production',
	// Origin publik untuk canonical/OG/sitemap (§8.2). Mirror web `NEXT_PUBLIC_SITE_URL`. Domain
	// dipindah tanpa ubah kode. Trailing slash di-strip di konsumen (`lib/seo/config.ts`).
	PUBLIC_SITE_URL: 'https://aqshara.com',
	// Gate index mesin telusur (Phase 4 preview-noindex → cutover, §10). Default 'false' = preview
	// aman tak ter-index; owner set 'true' saat flip domain (Phase 12). 'true' = robots parity web.
	PUBLIC_SEO_ALLOW_INDEXING: 'false'
} as const;

export type PublicEnv = {
	PUBLIC_CLERK_PUBLISHABLE_KEY: string;
	PUBLIC_CLERK_SIGN_IN_URL: string;
	PUBLIC_CLERK_SIGN_UP_URL: string;
	PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: string;
	PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: string;
	PUBLIC_API_URL: string;
	/** DSN Sentry klien; `null` = disabled (SDK no-op). */
	PUBLIC_SENTRY_DSN: string | null;
	PUBLIC_SENTRY_ENVIRONMENT: string;
	/** Origin publik (tanpa trailing slash di konsumen) untuk canonical/OG/sitemap. */
	PUBLIC_SITE_URL: string;
	/** 'true' → mesin telusur boleh index (cutover). 'false' → noindex (preview). */
	PUBLIC_SEO_ALLOW_INDEXING: string;
};

function pick(raw: Record<string, string | undefined>, key: string, fallback: string): string {
	const value = raw[key];
	return value && value.length > 0 ? value : fallback;
}

/**
 * Terapkan default ke record env PUBLIC mentah → `PublicEnv` bertipe (TANPA validasi ketat, agar
 * client tak crash pada nilai opsional). Validasi keras (required, format URL) dilakukan zod di
 * `schema.ts` saat boot server (fail-fast); client menerima nilai yang sudah tervalidasi server.
 */
export function applyPublicDefaults(raw: Record<string, string | undefined>): PublicEnv {
	const dsn = raw.PUBLIC_SENTRY_DSN;
	return {
		PUBLIC_CLERK_PUBLISHABLE_KEY: raw.PUBLIC_CLERK_PUBLISHABLE_KEY ?? '',
		PUBLIC_CLERK_SIGN_IN_URL: pick(
			raw,
			'PUBLIC_CLERK_SIGN_IN_URL',
			PUBLIC_ENV_DEFAULTS.PUBLIC_CLERK_SIGN_IN_URL
		),
		PUBLIC_CLERK_SIGN_UP_URL: pick(
			raw,
			'PUBLIC_CLERK_SIGN_UP_URL',
			PUBLIC_ENV_DEFAULTS.PUBLIC_CLERK_SIGN_UP_URL
		),
		PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: pick(
			raw,
			'PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL',
			PUBLIC_ENV_DEFAULTS.PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL
		),
		PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: pick(
			raw,
			'PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL',
			PUBLIC_ENV_DEFAULTS.PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL
		),
		PUBLIC_API_URL: pick(raw, 'PUBLIC_API_URL', PUBLIC_ENV_DEFAULTS.PUBLIC_API_URL),
		PUBLIC_SENTRY_DSN: dsn && dsn.length > 0 ? dsn : null,
		PUBLIC_SENTRY_ENVIRONMENT: pick(
			raw,
			'PUBLIC_SENTRY_ENVIRONMENT',
			PUBLIC_ENV_DEFAULTS.PUBLIC_SENTRY_ENVIRONMENT
		),
		PUBLIC_SITE_URL: pick(raw, 'PUBLIC_SITE_URL', PUBLIC_ENV_DEFAULTS.PUBLIC_SITE_URL),
		PUBLIC_SEO_ALLOW_INDEXING: pick(
			raw,
			'PUBLIC_SEO_ALLOW_INDEXING',
			PUBLIC_ENV_DEFAULTS.PUBLIC_SEO_ALLOW_INDEXING
		)
	};
}

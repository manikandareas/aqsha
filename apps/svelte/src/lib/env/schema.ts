/**
 * Skema validasi env — zod, fail-fast (§3.7). Diimpor HANYA oleh kode server (`$lib/server/env`) &
 * test, jadi zod tak pernah masuk client bundle. `parsePublicEnv`/`parsePrivateEnv` = fungsi pure
 * (menerima record) → unit-testable tanpa `$env`. Default nilai PUBLIC hidup di `defaults.ts`.
 */
import { z } from 'zod';
import { applyPublicDefaults, type PublicEnv } from './defaults';
import { parseSampleRate } from '$lib/observability/sample-rate';

const publicEnvSchema = z.object({
	PUBLIC_CLERK_PUBLISHABLE_KEY: z
		.string()
		.min(1, 'PUBLIC_CLERK_PUBLISHABLE_KEY wajib diisi')
		.startsWith('pk_', 'PUBLIC_CLERK_PUBLISHABLE_KEY harus diawali "pk_"'),
	PUBLIC_CLERK_SIGN_IN_URL: z.string().min(1),
	PUBLIC_CLERK_SIGN_UP_URL: z.string().min(1),
	PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: z.string().min(1),
	PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: z.string().min(1),
	PUBLIC_API_URL: z.url('PUBLIC_API_URL harus URL valid'),
	PUBLIC_SENTRY_DSN: z.string().nullable(),
	PUBLIC_SENTRY_ENVIRONMENT: z.string().min(1),
	PUBLIC_SITE_URL: z.url('PUBLIC_SITE_URL harus URL valid'),
	PUBLIC_SEO_ALLOW_INDEXING: z.enum(['true', 'false'])
});

export type PrivateEnv = {
	CLERK_SECRET_KEY: string;
	MASTRA_AGENT_ORIGIN: string;
	SENTRY_DSN: string | null;
	SENTRY_ENVIRONMENT: string;
	SENTRY_TRACES_SAMPLE_RATE: number;
	SENTRY_RELEASE: string | null;
};

const privateEnvSchema = z.object({
	CLERK_SECRET_KEY: z
		.string()
		.min(1, 'CLERK_SECRET_KEY wajib diisi')
		.startsWith('sk_', 'CLERK_SECRET_KEY harus diawali "sk_"'),
	MASTRA_AGENT_ORIGIN: z.url('MASTRA_AGENT_ORIGIN harus URL valid'),
	SENTRY_DSN: z.string().nullable(),
	SENTRY_ENVIRONMENT: z.string().min(1),
	SENTRY_TRACES_SAMPLE_RATE: z.number().min(0).max(1),
	SENTRY_RELEASE: z.string().nullable()
});

/** Validasi env PUBLIC (default sudah diterapkan) → `PublicEnv`. Throw `ZodError` bila invalid. */
export function parsePublicEnv(raw: Record<string, string | undefined>): PublicEnv {
	return publicEnvSchema.parse(applyPublicDefaults(raw));
}

/** Validasi env PRIVATE (server-only) → `PrivateEnv`. Throw `ZodError` bila invalid. */
export function parsePrivateEnv(raw: Record<string, string | undefined>): PrivateEnv {
	const dsn = raw.SENTRY_DSN;
	return privateEnvSchema.parse({
		CLERK_SECRET_KEY: raw.CLERK_SECRET_KEY ?? '',
		MASTRA_AGENT_ORIGIN:
			raw.MASTRA_AGENT_ORIGIN && raw.MASTRA_AGENT_ORIGIN.length > 0
				? raw.MASTRA_AGENT_ORIGIN
				: 'http://localhost:4111',
		SENTRY_DSN: dsn && dsn.length > 0 ? dsn : null,
		SENTRY_ENVIRONMENT:
			raw.SENTRY_ENVIRONMENT && raw.SENTRY_ENVIRONMENT.length > 0
				? raw.SENTRY_ENVIRONMENT
				: 'production',
		SENTRY_TRACES_SAMPLE_RATE: parseSampleRate(raw.SENTRY_TRACES_SAMPLE_RATE),
		SENTRY_RELEASE: raw.SENTRY_RELEASE && raw.SENTRY_RELEASE.length > 0 ? raw.SENTRY_RELEASE : null
	});
}

import { describe, expect, it } from 'vitest';
import { parsePrivateEnv, parsePublicEnv } from './schema';

const validPublic = {
	PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_abc',
	PUBLIC_API_URL: 'http://localhost:3001'
};

const validPrivate = {
	CLERK_SECRET_KEY: 'sk_test_abc',
	MASTRA_AGENT_ORIGIN: 'http://localhost:4111'
};

describe('parsePublicEnv', () => {
	it('menerapkan default untuk field opsional + DSN kosong → null', () => {
		const env = parsePublicEnv(validPublic);
		expect(env.PUBLIC_CLERK_SIGN_IN_URL).toBe('/sign-in');
		expect(env.PUBLIC_CLERK_SIGN_UP_URL).toBe('/sign-up');
		expect(env.PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL).toBe('/app');
		expect(env.PUBLIC_SENTRY_DSN).toBeNull();
		expect(env.PUBLIC_SENTRY_ENVIRONMENT).toBe('production');
	});

	it('menghormati override eksplisit', () => {
		const env = parsePublicEnv({
			...validPublic,
			PUBLIC_CLERK_SIGN_IN_URL: '/masuk',
			PUBLIC_SENTRY_DSN: 'https://k@o1.ingest.sentry.io/2'
		});
		expect(env.PUBLIC_CLERK_SIGN_IN_URL).toBe('/masuk');
		expect(env.PUBLIC_SENTRY_DSN).toBe('https://k@o1.ingest.sentry.io/2');
	});

	it('fail-fast: publishable key hilang / salah prefix', () => {
		expect(() => parsePublicEnv({ PUBLIC_API_URL: 'http://localhost:3001' })).toThrow();
		expect(() =>
			parsePublicEnv({ ...validPublic, PUBLIC_CLERK_PUBLISHABLE_KEY: 'sk_wrong' })
		).toThrow();
	});

	it('fail-fast: PUBLIC_API_URL bukan URL', () => {
		expect(() => parsePublicEnv({ ...validPublic, PUBLIC_API_URL: 'not-a-url' })).toThrow();
	});
});

describe('parsePrivateEnv', () => {
	it('valid + default (SENTRY_ENVIRONMENT, sample rate 0, DSN null)', () => {
		const env = parsePrivateEnv(validPrivate);
		expect(env.CLERK_SECRET_KEY).toBe('sk_test_abc');
		expect(env.MASTRA_AGENT_ORIGIN).toBe('http://localhost:4111');
		expect(env.SENTRY_DSN).toBeNull();
		expect(env.SENTRY_ENVIRONMENT).toBe('production');
		expect(env.SENTRY_TRACES_SAMPLE_RATE).toBe(0);
		expect(env.SENTRY_RELEASE).toBeNull();
	});

	it('default MASTRA_AGENT_ORIGIN saat kosong', () => {
		expect(parsePrivateEnv({ CLERK_SECRET_KEY: 'sk_x' }).MASTRA_AGENT_ORIGIN).toBe(
			'http://localhost:4111'
		);
	});

	it('SENTRY_TRACES_SAMPLE_RATE di-clamp/parse via parseSampleRate', () => {
		expect(
			parsePrivateEnv({ ...validPrivate, SENTRY_TRACES_SAMPLE_RATE: '0.3' })
				.SENTRY_TRACES_SAMPLE_RATE
		).toBe(0.3);
		expect(
			parsePrivateEnv({ ...validPrivate, SENTRY_TRACES_SAMPLE_RATE: '5' }).SENTRY_TRACES_SAMPLE_RATE
		).toBe(1);
		expect(
			parsePrivateEnv({ ...validPrivate, SENTRY_TRACES_SAMPLE_RATE: 'x' }).SENTRY_TRACES_SAMPLE_RATE
		).toBe(0);
	});

	it('fail-fast: CLERK_SECRET_KEY hilang / salah prefix', () => {
		expect(() => parsePrivateEnv({ MASTRA_AGENT_ORIGIN: 'http://localhost:4111' })).toThrow();
		expect(() => parsePrivateEnv({ ...validPrivate, CLERK_SECRET_KEY: 'pk_wrong' })).toThrow();
	});

	it('fail-fast: MASTRA_AGENT_ORIGIN bukan URL', () => {
		expect(() => parsePrivateEnv({ ...validPrivate, MASTRA_AGENT_ORIGIN: 'nope' })).toThrow();
	});
});

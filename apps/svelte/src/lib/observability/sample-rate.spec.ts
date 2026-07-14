import { describe, expect, it } from 'vitest';
import { parseSampleRate, parseSentryDsn } from './sample-rate';

describe('parseSampleRate', () => {
	it('null/empty → fallback (default 0)', () => {
		expect(parseSampleRate(undefined)).toBe(0);
		expect(parseSampleRate(null)).toBe(0);
		expect(parseSampleRate('')).toBe(0);
		expect(parseSampleRate('', 0.25)).toBe(0.25);
	});

	it('angka valid diteruskan', () => {
		expect(parseSampleRate('0.5')).toBe(0.5);
		expect(parseSampleRate('0')).toBe(0);
		expect(parseSampleRate('1')).toBe(1);
	});

	it('clamp ke [0,1], bukan ditolak', () => {
		expect(parseSampleRate('2')).toBe(1);
		expect(parseSampleRate('-1')).toBe(0);
	});

	it('non-finite/NaN → fallback', () => {
		expect(parseSampleRate('abc')).toBe(0);
		expect(parseSampleRate('NaN')).toBe(0);
		expect(parseSampleRate('Infinity')).toBe(0);
	});
});

describe('parseSentryDsn', () => {
	it('parse DSN valid → host, projectId, ingestUrl', () => {
		const parsed = parseSentryDsn('https://abc123@o456.ingest.us.sentry.io/789');
		expect(parsed).toEqual({
			host: 'o456.ingest.us.sentry.io',
			projectId: '789',
			ingestUrl: 'https://o456.ingest.us.sentry.io/api/789/envelope/'
		});
	});

	it('kosong/null → null', () => {
		expect(parseSentryDsn(null)).toBeNull();
		expect(parseSentryDsn(undefined)).toBeNull();
		expect(parseSentryDsn('')).toBeNull();
	});

	it('malformed / tanpa project / tanpa public key → null', () => {
		expect(parseSentryDsn('not a url')).toBeNull();
		expect(parseSentryDsn('https://o456.ingest.sentry.io/789')).toBeNull(); // no public key
		expect(parseSentryDsn('https://abc@o456.ingest.sentry.io/')).toBeNull(); // no project
	});
});

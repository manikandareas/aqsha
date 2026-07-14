import { describe, expect, it } from 'vitest';
import {
	apiErrorCode,
	normalizeApiError,
	readableApiErrorMessage,
	type StructuredAppError
} from './api-error';

// Eden error shape: `{ status, value }` di mana `value` = body appError terstruktur.
function edenError(status: number, value: unknown): { status: number; value: unknown } {
	return { status, value };
}

const appErr: StructuredAppError = {
	message: 'Batas pin tercapai',
	code: 'pin_limit_reached',
	severity: 'warning',
	field: 'pinnedAt'
};

describe('readableApiErrorMessage', () => {
	it('mengambil value.message dari error Eden terstruktur', () => {
		expect(readableApiErrorMessage(edenError(429, appErr), 'fallback')).toBe('Batas pin tercapai');
	});

	it('fallback bila bukan error terstruktur', () => {
		expect(readableApiErrorMessage(new Error('boom'), 'fallback')).toBe('fallback');
		expect(readableApiErrorMessage(null, 'fallback')).toBe('fallback');
		expect(readableApiErrorMessage(edenError(500, { code: 'x' }), 'fallback')).toBe('fallback');
	});
});

describe('apiErrorCode', () => {
	it('mengambil value.code untuk branch UI', () => {
		expect(apiErrorCode(edenError(429, appErr))).toBe('pin_limit_reached');
	});

	it('null bila bukan appError', () => {
		expect(apiErrorCode(new Error('boom'))).toBeNull();
		expect(apiErrorCode(edenError(500, { message: 'tanpa code' }))).toBeNull();
		expect(apiErrorCode(undefined)).toBeNull();
	});
});

describe('normalizeApiError', () => {
	it('memetakan appError penuh (message, code, severity, field, status)', () => {
		expect(normalizeApiError(edenError(429, appErr))).toEqual({
			message: 'Batas pin tercapai',
			code: 'pin_limit_reached',
			severity: 'warning',
			field: 'pinnedAt',
			status: 429
		});
	});

	it('code "unknown" + severity "error" bila value hanya message', () => {
		expect(normalizeApiError(edenError(400, { message: 'oops' }))).toEqual({
			message: 'oops',
			code: 'unknown',
			severity: 'error',
			field: null,
			status: 400
		});
	});

	it('menerima error yang hanya punya code (message → fallback)', () => {
		const out = normalizeApiError(edenError(403, { code: 'forbidden' }), 'fallback');
		expect(out.code).toBe('forbidden');
		expect(out.message).toBe('fallback');
		expect(out.status).toBe(403);
	});

	it('menormalkan Error biasa', () => {
		expect(normalizeApiError(new Error('boom'))).toEqual({
			message: 'boom',
			code: 'unknown',
			severity: 'error',
			field: null,
			status: null
		});
	});

	it('menormalkan string dan nilai tak dikenal ke fallback', () => {
		expect(normalizeApiError('teks', 'fb').message).toBe('teks');
		expect(normalizeApiError(null, 'fb')).toEqual({
			message: 'fb',
			code: 'unknown',
			severity: 'error',
			field: null,
			status: null
		});
	});

	it('severity invalid → "error"', () => {
		const out = normalizeApiError(edenError(400, { message: 'm', code: 'c', severity: 'bogus' }));
		expect(out.severity).toBe('error');
	});
});

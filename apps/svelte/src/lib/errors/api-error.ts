/**
 * Normalisasi error API klien. Port dari `apps/web/lib/api-error.ts` (+ struktur `appError` di
 * `packages/db/src/appError.ts`). Eden Treaty tak pernah throw: ia mengembalikan `{ data, error }`
 * dengan `error` berbentuk `{ status, value }`, di mana `value` = body terstruktur backend
 * `{ message, code, severity?, field? }`. Modul ini mengubah bentuk-bentuk itu menjadi satu
 * `NormalizedApiError` yang stabil untuk UI, plus dua getter primitif (`readableApiErrorMessage`,
 * `apiErrorCode`) yang identik contract dengan web agar branch UI (mis. soft-cap `pin_limit_reached`)
 * tetap sama.
 *
 * Modul pure (tanpa `$env`, tanpa `@aqsha/*` runtime) → aman di browser bundle & unit-testable.
 */

/** Bentuk payload appError terstruktur backend (CLAUDE.md "Error Handling"). */
export type StructuredAppError = {
	message: string;
	code: string;
	severity?: 'info' | 'warning' | 'error';
	field?: string;
};

/** Hasil normalisasi — selalu punya `message`+`code`; `code` = `'unknown'` bila bukan appError. */
export type NormalizedApiError = {
	message: string;
	code: string;
	severity: 'info' | 'warning' | 'error';
	field: string | null;
	/** HTTP status bila error Eden membawanya (`{ status }`), else `null`. */
	status: number | null;
};

/** Ambil `value` (body terstruktur) dari error Eden `{ status, value }`, jika ada. */
function edenErrorValue(error: unknown): unknown {
	if (error && typeof error === 'object' && 'value' in error) {
		return (error as { value?: unknown }).value;
	}
	return undefined;
}

function edenErrorStatus(error: unknown): number | null {
	if (error && typeof error === 'object' && 'status' in error) {
		const status = (error as { status?: unknown }).status;
		if (typeof status === 'number' && Number.isFinite(status)) return status;
	}
	return null;
}

function readString(value: unknown, key: string): string | null {
	if (value && typeof value === 'object' && key in value) {
		const inner = (value as Record<string, unknown>)[key];
		if (typeof inner === 'string' && inner.length > 0) return inner;
	}
	return null;
}

/**
 * Pesan human-readable dari error Eden. Prefer `value.message` terstruktur; fallback ke `fallback`.
 * Identik contract dengan `apps/web/lib/api-error.ts` — jangan render `error.message` mentah di UI.
 */
export function readableApiErrorMessage(error: unknown, fallback: string): string {
	return readString(edenErrorValue(error), 'message') ?? fallback;
}

/**
 * Kode error terstruktur (`value.code`), atau `null` bila bukan appError. Untuk mem-branch UI
 * (mis. `pin_limit_reached` → toast warning, bukan error). Identik contract dengan web.
 */
export function apiErrorCode(error: unknown): string | null {
	return readString(edenErrorValue(error), 'code');
}

function readSeverity(value: unknown): 'info' | 'warning' | 'error' {
	const severity = readString(value, 'severity');
	if (severity === 'info' || severity === 'warning' || severity === 'error') return severity;
	return 'error';
}

/**
 * Bentuk-lengkap: ubah error Eden apa pun (atau `Error` biasa, atau string) menjadi
 * `NormalizedApiError` yang selalu punya `message`+`code`. Dipakai boundary UI/toast dan pemetaan ke
 * SvelteKit `error()`. `code === 'unknown'` menandai error tak-terstruktur.
 */
export function normalizeApiError(
	error: unknown,
	fallback = 'Terjadi kesalahan.'
): NormalizedApiError {
	const value = edenErrorValue(error);
	const structuredMessage = readString(value, 'message');
	const structuredCode = readString(value, 'code');

	if (structuredMessage || structuredCode) {
		return {
			message: structuredMessage ?? fallback,
			code: structuredCode ?? 'unknown',
			severity: readSeverity(value),
			field: readString(value, 'field'),
			status: edenErrorStatus(error)
		};
	}

	if (error instanceof Error && error.message) {
		return {
			message: error.message,
			code: 'unknown',
			severity: 'error',
			field: null,
			status: null
		};
	}
	if (typeof error === 'string' && error.length > 0) {
		return { message: error, code: 'unknown', severity: 'error', field: null, status: null };
	}
	return {
		message: fallback,
		code: 'unknown',
		severity: 'error',
		field: null,
		status: edenErrorStatus(error)
	};
}

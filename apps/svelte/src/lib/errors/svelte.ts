import { error } from '@sveltejs/kit';
import { normalizeApiError } from './api-error';

/**
 * Petakan error API (Eden/appError) ke SvelteKit `error()` untuk `load`/`+server` — expected error.
 * `error()` melempar `HttpError`, jadi ini tak pernah return; SvelteKit
 * merender `+error.svelte` dengan `$page.error = { message, code }` (App.Error, lihat `app.d.ts`).
 * `handleError` (Sentry) TIDAK menerima ini — hanya unexpected error yang lolos ke sana.
 */
export function failWithApiError(err: unknown, fallback = 'Terjadi kesalahan.'): never {
	const normalized = normalizeApiError(err, fallback);
	// appError tanpa status (mis. dari value.code) default 500; status Eden dipakai bila ada.
	const status = normalized.status && normalized.status >= 400 ? normalized.status : 500;
	error(status, { message: normalized.message, code: normalized.code });
}

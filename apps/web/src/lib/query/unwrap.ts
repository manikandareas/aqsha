/**
 * `unwrap()` untuk Eden Treaty. Eden mengembalikan `{ data, error }` dan TAK PERNAH throw; TanStack
 * Query butuh `queryFn` yang throw agar masuk state error. `unwrap` melempar `error` (bentuk Eden
 * `{ status, value }`) apa adanya — dibaca `readableApiErrorMessage`/`normalizeApiError` di UI.
 *
 * Pure, browser-safe, unit-testable.
 */
export function unwrap<T>(res: { data: T | null; error: unknown }): T {
	if (res.error) throw res.error;
	return res.data as T;
}

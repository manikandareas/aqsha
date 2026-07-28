import { describe, expect, it } from 'vitest';
import { unwrap } from './unwrap';

describe('unwrap', () => {
	it('mengembalikan data saat tak ada error', () => {
		expect(unwrap({ data: { id: 1 }, error: null })).toEqual({ id: 1 });
	});

	it('melempar error Eden apa adanya (untuk dibaca normalizeApiError di UI)', () => {
		const edenError = { status: 429, value: { message: 'rate limit', code: 'too_many' } };
		expect(() => unwrap({ data: null, error: edenError })).toThrow();
		try {
			unwrap({ data: null, error: edenError });
		} catch (thrown) {
			expect(thrown).toBe(edenError);
		}
	});

	it('data null tanpa error → null (bukan throw)', () => {
		expect(unwrap<null>({ data: null, error: null })).toBeNull();
	});
});

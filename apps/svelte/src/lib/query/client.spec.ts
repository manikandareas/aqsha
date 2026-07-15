import { describe, expect, it } from 'vitest';
import { createQueryClient } from './client';

// Cross-user cache isolation. `createQueryClient()` = per-request; dua client TIDAK berbagi cache
// → data user A tak bocor ke user B pada proses Node bersama (SSR).
describe('createQueryClient — per-request isolation', () => {
	it('dua client tidak berbagi cache (no cross-user leak)', () => {
		const clientA = createQueryClient();
		const clientB = createQueryClient();

		clientA.setQueryData(['user', 'me'], { name: 'A-secret' });

		expect(clientA.getQueryData(['user', 'me'])).toEqual({ name: 'A-secret' });
		expect(clientB.getQueryData(['user', 'me'])).toBeUndefined();
	});

	it('membawa default policy (networkMode always, staleTime, retry)', () => {
		const defaults = createQueryClient().getDefaultOptions();
		expect(defaults.queries?.networkMode).toBe('always');
		expect(defaults.queries?.staleTime).toBe(30_000);
		expect(defaults.queries?.retry).toBe(1);
		expect(defaults.queries?.refetchOnWindowFocus).toBe(false);
		expect(defaults.mutations?.networkMode).toBe('always');
	});
});

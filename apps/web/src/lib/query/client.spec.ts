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

	it('menonaktifkan retry pada server dan mempertahankan satu retry di browser', () => {
		const serverDefaults = createQueryClient({ server: true }).getDefaultOptions();
		const browserDefaults = createQueryClient({ server: false }).getDefaultOptions();

		expect(serverDefaults.queries?.retry).toBe(0);
		expect(browserDefaults.queries?.retry).toBe(1);
		expect(serverDefaults.queries?.networkMode).toBe('always');
		expect(serverDefaults.queries?.staleTime).toBe(30_000);
		expect(serverDefaults.queries?.refetchOnWindowFocus).toBe(false);
		expect(serverDefaults.mutations?.networkMode).toBe('always');
	});
});

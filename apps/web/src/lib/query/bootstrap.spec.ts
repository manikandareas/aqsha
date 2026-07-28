import { describe, expect, it } from 'vitest';
import { deferredQueryResult, queryBootstrapId } from './bootstrap';

describe('query bootstrap', () => {
	it('membuat identifier deterministik tanpa bergantung pada urutan parameter', () => {
		expect(queryBootstrapId('/app/projects/[projectId]', { tab: 'chat', projectId: 'ws_1' })).toBe(
			queryBootstrapId('/app/projects/[projectId]', { projectId: 'ws_1', tab: 'chat' })
		);
	});

	it('mengubah deferred success menjadi union serializable', async () => {
		const result = await deferredQueryResult(async () => ({ mutations: [], queries: [] }));

		expect(result).toEqual({ ok: true, state: { mutations: [], queries: [] } });
		expect(() => JSON.stringify(result)).not.toThrow();
	});

	it('menangkap rejection tanpa membocorkan raw error', async () => {
		const result = await deferredQueryResult(
			async () => Promise.reject(new Error('token rahasia')),
			'Data region belum dapat dimuat.'
		);

		expect(result).toEqual({
			ok: false,
			error: { code: 'deferred_query_failed', message: 'Data region belum dapat dimuat.' }
		});
		expect(() => JSON.stringify(result)).not.toThrow();
	});
});

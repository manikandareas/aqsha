import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '@aqsha/api/client';
import { workspaceDetailQueryOptions, workspaceListQueryOptions } from './query-options';

describe('workspace list query options', () => {
	it('memakai key dan pagination yang sama untuk server dan browser', async () => {
		const get = vi.fn(async () => ({
			data: { items: [], nextCursor: 'cursor_2' },
			error: null
		}));
		const api = { workspaces: { get } } as unknown as ApiClient;
		const server = workspaceListQueryOptions(api, { includeArchived: false, enabled: true });
		const browser = workspaceListQueryOptions(api, { includeArchived: false, enabled: true });

		expect(server.queryKey).toEqual(browser.queryKey);
		expect(server.initialPageParam).toBeNull();
		expect(server.getNextPageParam?.({ items: [], nextCursor: 'cursor_2' }, [], null, [])).toBe(
			'cursor_2'
		);

		if (typeof server.queryFn !== 'function') throw new Error('queryFn tidak tersedia');
		await server.queryFn({ pageParam: null } as never);
		expect(get).toHaveBeenCalledWith({ query: { limit: 25, includeArchived: false } });
	});

	it('mewajibkan gate eksplisit untuk query authenticated', () => {
		const api = { workspaces: { get: vi.fn() } } as unknown as ApiClient;

		expect(workspaceListQueryOptions(api, { includeArchived: false, enabled: false }).enabled).toBe(
			false
		);
	});

	it('memakai factory detail yang sama untuk SSR dan browser', async () => {
		const get = vi.fn(async () => ({ data: { id: 'ws_1', name: 'Aqsha' }, error: null }));
		const api = {
			workspaces: Object.assign(() => ({ get }), { get: vi.fn() })
		} as unknown as ApiClient;
		const options = workspaceDetailQueryOptions(api, { id: 'ws_1', enabled: true });

		expect(options.queryKey).toEqual(['workspaces', 'detail', 'ws_1']);
		expect(options.enabled).toBe(true);
		if (typeof options.queryFn !== 'function') throw new Error('queryFn tidak tersedia');
		await options.queryFn({} as never);
		expect(get).toHaveBeenCalledOnce();
	});
});

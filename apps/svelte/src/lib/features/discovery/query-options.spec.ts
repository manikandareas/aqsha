import { describe, expect, it, vi } from 'vitest';
import {
	FEED_PAGE_SIZE,
	feedInfiniteQueryOptions,
	literatureSearchInfiniteQueryOptions,
	paperSearchInfiniteQueryOptions
} from './query-options';

const api = {
	feed: { get: vi.fn() },
	papers: {
		search: { get: vi.fn() },
		'literature-search': { post: vi.fn() }
	}
} as never;

describe('discovery query options', () => {
	it('keeps the feed key and cursor contract identical for server and browser callers', () => {
		const options = feedInfiniteQueryOptions(api, {
			mode: 'topics',
			topic: 'sains_teknologi',
			enabled: true
		});

		expect(options.queryKey).toEqual([
			'feed',
			'list',
			{ mode: 'topics', topic: 'sains_teknologi' }
		]);
		expect(options.initialPageParam).toBeNull();
		expect(FEED_PAGE_SIZE).toBe(20);
		expect(options.getNextPageParam?.({ items: [], nextCursor: 'next' }, [], null, [])).toBe(
			'next'
		);
	});

	it('uses the normalized search key and first page', () => {
		const options = paperSearchInfiniteQueryOptions(api, {
			query: '  causal inference  ',
			fromYear: 2020,
			enabled: true
		});

		expect(options.queryKey).toEqual([
			'papers',
			'search',
			{ query: 'causal inference', fromYear: 2020 }
		]);
		expect(options.initialPageParam).toBe(1);
	});

	it('mengirim applied state dan meneruskan cursor', () => {
		const options = literatureSearchInfiniteQueryOptions(api, {
			state: { q: 'climate', sort: 'relevance', filters: [], topic: null },
			enabled: true
		});
		expect(options.initialPageParam).toBeNull();
		expect(options.queryKey).toEqual([
			'papers',
			'literature-search',
			{ q: 'climate', sort: 'relevance', filters: [] }
		]);
	});
});

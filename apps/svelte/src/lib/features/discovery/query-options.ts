import { infiniteQueryOptions, keepPreviousData, type InfiniteData } from '@tanstack/svelte-query';
import type { ApiClient } from '@aqsha/api/client';
import { queryKeys, unwrap } from '$lib/query';
import type { AppliedLiteratureSearchState } from '$lib/features/explore/literature-search-state.svelte';
import type { LiteratureSearchPage } from '$lib/features/explore/literature-search-types';
import type { ExplorePaper, FeedItem, FeedMode, FeedTopic } from './types';

export const FEED_PAGE_SIZE = 20;
const VISIBLE_KINDS = ['paper'] as const;
const LITERATURE_PAGE_SIZE = 20;

export type FeedPage = { items: FeedItem[]; nextCursor: string | null };
export type SearchPaper = Omit<ExplorePaper, 'lastSeenAt'>;
export type PaperSearchPage = {
	items: SearchPaper[];
	cached?: boolean;
	nextPage: number | null;
};

export type { LiteratureSearchPage };

export function feedInfiniteQueryOptions(
	api: ApiClient,
	params: { mode: FeedMode; topic: FeedTopic | null; enabled: boolean }
) {
	return infiniteQueryOptions<
		FeedPage,
		Error,
		InfiniteData<FeedPage, string | null>,
		ReturnType<typeof queryKeys.feed.list>,
		string | null
	>({
		queryKey: queryKeys.feed.list({ mode: params.mode, topic: params.topic }),
		enabled: params.enabled,
		placeholderData: keepPreviousData,
		initialPageParam: null,
		queryFn: async ({ pageParam, signal }) =>
			unwrap(
				await api.feed.get({
					query: {
						limit: FEED_PAGE_SIZE,
						mode: params.mode,
						kinds: [...VISIBLE_KINDS],
						...(params.topic ? { topic: params.topic } : {}),
						...(pageParam ? { cursor: pageParam } : {})
					},
					fetch: { signal }
				})
			) as FeedPage,
		getNextPageParam: (last) => last.nextCursor
	});
}

export function paperSearchInfiniteQueryOptions(
	api: ApiClient,
	params: { query: string; fromYear: number | undefined; enabled: boolean }
) {
	const query = params.query.trim();
	return infiniteQueryOptions<
		PaperSearchPage,
		Error,
		InfiniteData<PaperSearchPage, number>,
		ReturnType<typeof queryKeys.papers.search>,
		number
	>({
		queryKey: queryKeys.papers.search({ query, fromYear: params.fromYear ?? null }),
		enabled: params.enabled && query.length > 0,
		placeholderData: keepPreviousData,
		staleTime: 5 * 60_000,
		initialPageParam: 1,
		queryFn: async ({ pageParam, signal }) =>
			unwrap(
				await api.papers.search.get({
					query: {
						query,
						mode: 'search',
						limit: 12,
						page: pageParam,
						...(params.fromYear ? { fromYear: params.fromYear } : {})
					},
					fetch: { signal }
				})
			) as PaperSearchPage,
		getNextPageParam: (last) => last.nextPage
	});
}

export function literatureSearchInfiniteQueryOptions(
	api: ApiClient,
	params: { state: AppliedLiteratureSearchState; enabled: boolean }
) {
	const state = {
		q: params.state.q.trim(),
		sort: params.state.sort,
		filters: params.state.filters
	};
	return infiniteQueryOptions<
		LiteratureSearchPage,
		Error,
		InfiniteData<LiteratureSearchPage, string | null>,
		ReturnType<typeof queryKeys.papers.literatureSearch>,
		string | null
	>({
		queryKey: queryKeys.papers.literatureSearch(state),
		enabled: params.enabled && state.q.length > 0,
		placeholderData: keepPreviousData,
		staleTime: 5 * 60_000,
		initialPageParam: null,
		queryFn: async ({ pageParam, signal }) =>
			unwrap(
				await api.papers['literature-search'].post(
					{
						query: state.q,
						sort: state.sort,
						filters: state.filters,
						cursor: pageParam,
						limit: LITERATURE_PAGE_SIZE
					},
					{ fetch: { signal } }
				)
			) as LiteratureSearchPage,
		getNextPageParam: (last) => last.nextCursor
	});
}

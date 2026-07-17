import {
	createInfiniteQuery,
	createMutation,
	createQuery,
	keepPreviousData
} from '@tanstack/svelte-query';
import { getApiClient } from '$lib/api';
import { queryKeys, unwrap } from '$lib/query';
import type { DiscoveryItemRef, ExplorePaper, FeedItem, FeedMode, FeedTopic } from './types';

/**
 * Discovery query/mutation hooks. Called during component init (query + api-client context). Reactive
 * inputs are passed as getters (see `features/threads/api.ts`). Query keys, page size, stale policy,
 * and the `keepPreviousData` fade match the product contract.
 */

const FEED_PAGE_SIZE = 20;

// Only papers carry research value; claim/topic/idea kinds are pruned.
const VISIBLE_KINDS = ['paper'] as const;

type FeedPage = { items: FeedItem[]; nextCursor: string | null };

const always = () => true;

/**
 * Feed infinite-scroll keyset (For You/Top/Topics). `nextCursor` null = last page. A page can shrink
 * below the limit (server-side hidden/kind/topic filter) while `nextCursor` stays correct → the component
 * auto-loads on as long as `hasNextPage`.
 */
export function useFeedInfinite(
	mode: () => FeedMode,
	topic: () => FeedTopic | null,
	enabled: () => boolean = always
) {
	const api = getApiClient();
	return createInfiniteQuery(() => ({
		queryKey: queryKeys.feed.list({ mode: mode(), topic: topic() }),
		enabled: enabled(),
		// Switching topic keeps the old feed (faded) while the new one loads — avoids a full spinner
		// flash when moving between topics in Jelajahi.
		placeholderData: keepPreviousData,
		initialPageParam: null as string | null,
		queryFn: async ({ pageParam }: { pageParam: string | null }) => {
			const t = topic();
			return unwrap(
				await api.feed.get({
					query: {
						limit: FEED_PAGE_SIZE,
						mode: mode(),
						kinds: [...VISIBLE_KINDS],
						...(t ? { topic: t } : {}),
						...(pageParam ? { cursor: pageParam } : {})
					}
				})
			) as FeedPage;
		},
		getNextPageParam: (last: FeedPage) => last.nextCursor
	}));
}

export type SearchPaper = Omit<ExplorePaper, 'lastSeenAt'>;
export type PaperSearchPage = {
	items: SearchPaper[];
	cached?: boolean;
	/** Next page (OpenAlex basic-paging) for load-more; null = exhausted. */
	nextPage: number | null;
};

/**
 * Live academic paper search — waterfall OpenAlex→arXiv→Crossref via /papers/search (mode=search),
 * FREE + rate-limited server-side. Manual load-more via `page` (OpenAlex `page`); `nextPage` null =
 * exhausted. Enabled only when `q` is non-empty.
 */
export function usePaperSearch(
	q: () => string,
	fromYear: () => number | undefined,
	enabled: () => boolean
) {
	const api = getApiClient();
	return createInfiniteQuery(() => {
		const trimmed = q().trim();
		const from = fromYear();
		return {
			queryKey: queryKeys.papers.search({ query: trimmed, fromYear: from ?? null }),
			enabled: enabled() && trimmed.length > 0,
			// Old results stay visible (faded) as the query changes → smooth transition, no spinner.
			placeholderData: keepPreviousData,
			staleTime: 5 * 60_000,
			initialPageParam: 1 as number,
			queryFn: async ({ pageParam }: { pageParam: number }) =>
				unwrap(
					await api.papers.search.get({
						query: {
							query: trimmed,
							mode: 'search',
							limit: 12,
							page: pageParam,
							...(from ? { fromYear: from } : {})
						}
					})
				) as PaperSearchPage,
			getNextPageParam: (last: PaperSearchPage) => last.nextPage
		};
	});
}

/** Hide a discovery item (+ interest −1). Optimistic removal is handled by the caller. */
export function useHideDiscovery() {
	const api = getApiClient();
	return createMutation(() => ({
		mutationFn: async (itemRef: DiscoveryItemRef) =>
			unwrap(await api.feed.discovery.hide.post({ itemRef }))
	}));
}

/** Record a discovery interaction (save +1 / research +2). */
export function useRecordInteraction() {
	const api = getApiClient();
	return createMutation(() => ({
		mutationFn: async (input: { itemRef: DiscoveryItemRef; kind: 'save' | 'hide' | 'research' }) =>
			unwrap(await api.feed.discovery.interaction.post(input))
	}));
}

/**
 * Paper reader (getPaperDetail: cache/cold-resolve + OpenAlex enrichment). `null` = unresolved. The key
 * rides as a QUERY PARAM — the canonical key contains `/` (DOI/url) which would split an Eden path param.
 */
export function usePaper(key: () => string, enabled: () => boolean = always) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.papers.detail(key()),
		enabled: enabled() && Boolean(key()),
		queryFn: async () =>
			(unwrap(await api.papers.detail.get({ query: { key: key() } })) ??
				null) as ExplorePaper | null
	}));
}

/** Reader feed item, by feed row id. */
export function useFeedItem(id: () => string, enabled: () => boolean = always) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.feed.item(id()),
		enabled: enabled() && Boolean(id()),
		queryFn: async () => unwrap(await api.feed({ id: id() }).get()) as FeedItem
	}));
}

/** Related same-kind ("Discover more"). */
export function useRelated(id: () => string, enabled: () => boolean = always) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: [...queryKeys.feed.item(id()), 'related'],
		enabled: enabled() && Boolean(id()),
		queryFn: async () =>
			(unwrap(await api.feed({ id: id() }).related.get({ query: {} })) as { items: FeedItem[] })
				.items
	}));
}

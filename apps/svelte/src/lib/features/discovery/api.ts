import { createInfiniteQuery, createMutation, createQuery } from '@tanstack/svelte-query';
import { getApiClient } from '$lib/api';
import { queryKeys, unwrap } from '$lib/query';
import type { AppliedLiteratureSearchState } from '$lib/features/explore/literature-search-state.svelte';
import type { DiscoveryItemRef, ExplorePaper, FeedMode, FeedTopic } from './types';
import {
	feedInfiniteQueryOptions,
	literatureSearchInfiniteQueryOptions,
	paperSearchInfiniteQueryOptions
} from './query-options';

export type { LiteratureSearchPage, PaperSearchPage, SearchPaper } from './query-options';

/**
 * Discovery query/mutation hooks. Called during component init (query + api-client context). Reactive
 * inputs are passed as getters (see `features/threads/api.ts`). Query keys, page size, stale policy,
 * and the `keepPreviousData` fade match the product contract.
 */

/**
 * Feed infinite-scroll keyset (For You/Top/Topics). `nextCursor` null = last page. A page can shrink
 * below the limit (server-side hidden/kind/topic filter) while `nextCursor` stays correct → the component
 * auto-loads on as long as `hasNextPage`.
 */
export function useFeedInfinite(
	mode: () => FeedMode,
	topic: () => FeedTopic | null,
	enabled: () => boolean
) {
	const api = getApiClient();
	return createInfiniteQuery(() =>
		feedInfiniteQueryOptions(api, { mode: mode(), topic: topic(), enabled: enabled() })
	);
}

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
	return createInfiniteQuery(() =>
		paperSearchInfiniteQueryOptions(api, {
			query: q(),
			fromYear: fromYear(),
			enabled: enabled()
		})
	);
}

/** Direct OpenAlex literature search (cursor pagination). Does not alter project paper search. */
export function useLiteratureSearch(
	state: () => AppliedLiteratureSearchState,
	enabled: () => boolean
) {
	const api = getApiClient();
	return createInfiniteQuery(() =>
		literatureSearchInfiniteQueryOptions(api, { state: state(), enabled: enabled() })
	);
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
		mutationFn: async (input: { itemRef: DiscoveryItemRef; kind: 'save' | 'research' | 'hide' }) =>
			unwrap(await api.feed.discovery.interaction.post(input))
	}));
}

/**
 * Paper reader (getPaperDetail: cache/cold-resolve + OpenAlex enrichment). `null` = unresolved. The key
 * rides as a QUERY PARAM — the canonical key contains `/` (DOI/url) which would split an Eden path param.
 */
export function usePaper(key: () => string, enabled: () => boolean) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.papers.detail(key()),
		enabled: enabled() && Boolean(key()),
		queryFn: async () =>
			(unwrap(await api.papers.detail.get({ query: { key: key() } })) ??
				null) as ExplorePaper | null
	}));
}

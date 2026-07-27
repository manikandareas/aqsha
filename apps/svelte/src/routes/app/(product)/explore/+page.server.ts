import { dehydrate } from '@tanstack/svelte-query';
import { createServerApiClient } from '$lib/server/api';
import {
	feedInfiniteQueryOptions,
	literatureSearchInfiniteQueryOptions
} from '$lib/features/discovery/query-options';
import { readExploreUrl } from '$lib/features/explore/explore-url-model';
import {
	EXPLORE_FILTER_PANEL_COOKIE,
	isFilterPanelOpenFromCookie
} from '$lib/features/explore/filter-panel-state';
import { createQueryClient, deferredQueryResult, queryBootstrapId } from '$lib/query';
import type { PageServerLoad } from './$types';

const EXPLORE_FEED_DEPENDENCY = 'app:explore-feed';

export const load: PageServerLoad = ({ cookies, depends, locals, url }) => {
	depends(EXPLORE_FEED_DEPENDENCY);
	const auth = locals.auth();
	const api = createServerApiClient(() => auth.getToken());
	const state = readExploreUrl(url.searchParams);
	const queryClient = createQueryClient({ server: true });

	const feed = deferredQueryResult(async () => {
		if (state.q.trim().length > 0) {
			await queryClient.prefetchInfiniteQuery(
				literatureSearchInfiniteQueryOptions(api, { state, enabled: true })
			);
		} else {
			await queryClient.prefetchInfiniteQuery(
				feedInfiniteQueryOptions(api, {
					mode: state.topic ? 'topics' : 'foryou',
					topic: state.topic,
					enabled: true
				})
			);
		}
		return dehydrate(queryClient);
	}, 'Temuan belum dapat dimuat.');

	return {
		// Read server-side so a restored-open rail is docked on first paint, not after hydration.
		filterPanelOpen: isFilterPanelOpenFromCookie(cookies.get(EXPLORE_FILTER_PANEL_COOKIE)),
		exploreBootstrap: {
			id: queryBootstrapId('/app/(product)/explore', {
				q: state.q,
				sort: state.sort,
				f: url.searchParams.get('f') ?? '',
				topic: state.topic ?? ''
			}),
			critical: dehydrate(createQueryClient({ server: true })),
			deferred: { feed }
		}
	};
};

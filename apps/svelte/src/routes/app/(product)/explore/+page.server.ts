import { dehydrate } from '@tanstack/svelte-query';
import { createServerApiClient } from '$lib/server/api';
import {
	feedInfiniteQueryOptions,
	paperSearchInfiniteQueryOptions
} from '$lib/features/discovery/query-options';
import { readExploreUrl } from '$lib/features/explore/explore-url-model';
import { createQueryClient, deferredQueryResult, queryBootstrapId } from '$lib/query';
import type { PageServerLoad } from './$types';

const EXPLORE_FEED_DEPENDENCY = 'app:explore-feed';

export const load: PageServerLoad = ({ depends, locals, url }) => {
	depends(EXPLORE_FEED_DEPENDENCY);
	const auth = locals.auth();
	const api = createServerApiClient(() => auth.getToken());
	const state = readExploreUrl(url.searchParams);
	const queryClient = createQueryClient({ server: true });

	const feed = deferredQueryResult(async () => {
		if (state.q.trim().length > 0) {
			await queryClient.prefetchInfiniteQuery(
				paperSearchInfiniteQueryOptions(api, {
					query: state.q,
					fromYear: undefined,
					enabled: true
				})
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
		exploreBootstrap: {
			id: queryBootstrapId('/app/(product)/explore', {
				q: state.q,
				topic: state.topic ?? ''
			}),
			critical: dehydrate(createQueryClient({ server: true })),
			deferred: { feed }
		}
	};
};

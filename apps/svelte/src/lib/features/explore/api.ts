// Explore data hooks (driven by the URL `q`).
//  - useExploreSuggest → typeahead query suggestions (cheap LLM, cached) for the ask-bar.
// Paper search itself uses the discovery feed (`features/discovery/api`).

import { createQuery } from '@tanstack/svelte-query';
import { getApiClient } from '$lib/api';
import { unwrap } from '$lib/query';

/** Typeahead query suggestions. Enabled only when the term is ≥ 2 chars (the server also gates). */
export function useExploreSuggest(term: () => string, enabled: () => boolean) {
	const api = getApiClient();
	return createQuery(() => {
		const q = term().trim();
		return {
			queryKey: ['explore', 'suggest', q],
			enabled: enabled() && q.length >= 2,
			staleTime: 5 * 60_000,
			queryFn: async () =>
				(unwrap(await api.explore.suggest.get({ query: { q } })) as { suggestions: string[] })
					.suggestions
		};
	});
}

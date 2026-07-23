// Explore data hooks (driven by the URL `q`).
//  - useExploreSuggest → typeahead query suggestions (cheap LLM, cached) for the ask-bar.
//  - useLiteratureCatalog / useLiteratureAutocomplete → advanced literature filter UI.
// Paper search itself uses the discovery feed (`features/discovery/api`).

import { createQuery } from '@tanstack/svelte-query';
import { getApiClient } from '$lib/api';
import { queryKeys, unwrap } from '$lib/query';
import type {
	LiteratureAutocompleteItem,
	LiteratureEntityKind,
	PublicLiteratureCatalog
} from './literature-search-types';

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

export function useLiteratureCatalog(enabled: () => boolean = () => true) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.papers.literatureCatalog(),
		enabled: enabled(),
		staleTime: 60 * 60_000,
		queryFn: async () =>
			unwrap(await api.papers['literature-search'].catalog.get()) as PublicLiteratureCatalog
	}));
}

export function useLiteratureAutocomplete(
	kind: () => LiteratureEntityKind,
	q: () => string,
	enabled: () => boolean
) {
	const api = getApiClient();
	return createQuery(() => {
		const query = q().trim();
		const entityKind = kind();
		return {
			queryKey: queryKeys.papers.literatureAutocomplete(entityKind, query),
			enabled: enabled() && query.length >= 2,
			staleTime: 5 * 60_000,
			queryFn: async () =>
				unwrap(
					await api.papers['literature-search'].autocomplete.get({
						query: { kind: entityKind, q: query }
					})
				) as LiteratureAutocompleteItem[]
		};
	});
}

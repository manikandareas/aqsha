import { expect, it } from 'vitest';
import { LiteratureSearchDraft } from './literature-search-state.svelte';

it('membuang edit lokal saat reset ke applied state', () => {
	const draft = new LiteratureSearchDraft({
		q: 'climate',
		sort: 'relevance',
		filters: [],
		topic: null
	});
	draft.replaceClause({ id: 'citation_count', value: { min: 50 } });
	draft.reset({ q: 'climate', sort: 'relevance', filters: [], topic: null });
	expect(draft.snapshot().filters).toEqual([]);
});

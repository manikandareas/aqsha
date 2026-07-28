import type { FeedTopic } from '$lib/features/discovery/types';
import type { LiteratureFilterClause, LiteratureSortId } from './literature-search-types';
import { isLiteratureSortId } from './literature-search-types';

export type AppliedLiteratureSearchState = {
	q: string;
	sort: LiteratureSortId;
	filters: LiteratureFilterClause[];
	topic: FeedTopic | null;
};

type EncodedFilterState = { v: 1; clauses: LiteratureFilterClause[] };

/**
 * Per-instance draft for Explore filter edits. Created in `ExplorePage` — never as module
 * singleton — so SSR and concurrent navigations do not share mutable state.
 */
export class LiteratureSearchDraft {
	q = $state('');
	sort = $state<LiteratureSortId>('relevance');
	filters = $state<LiteratureFilterClause[]>([]);
	topic = $state<FeedTopic | null>(null);

	constructor(applied: AppliedLiteratureSearchState) {
		this.reset(applied);
	}

	setQuery(query: string): void {
		this.q = query;
	}

	setSort(sort: LiteratureSortId): void {
		this.sort = isLiteratureSortId(sort) ? sort : 'relevance';
	}

	replaceClause(clause: LiteratureFilterClause): void {
		const next = this.filters.filter((item) => item.id !== clause.id);
		next.push(cloneFilters([clause])[0]!);
		this.filters = next;
	}

	removeClause(id: LiteratureFilterClause['id']): void {
		this.filters = this.filters.filter((item) => item.id !== id);
	}

	clearFilters(): void {
		this.filters = [];
	}

	reset(applied: AppliedLiteratureSearchState): void {
		this.q = applied.q;
		this.sort = applied.sort;
		this.filters = cloneFilters(applied.filters);
		this.topic = applied.topic;
	}

	snapshot(): AppliedLiteratureSearchState {
		return {
			q: this.q.trim().replace(/\s+/g, ' '),
			sort: this.sort,
			filters: cloneFilters(this.filters),
			topic: this.topic
		};
	}
}

/** JSON clone avoids Proxy/`$state` arrays that `structuredClone` rejects in the browser. */
function cloneFilters(filters: LiteratureFilterClause[]): LiteratureFilterClause[] {
	return JSON.parse(JSON.stringify(filters)) as LiteratureFilterClause[];
}

export function appliedLiteratureSignature(state: AppliedLiteratureSearchState): string {
	return JSON.stringify({
		q: state.q,
		sort: state.sort,
		filters: state.filters,
		topic: state.topic
	});
}

export type { EncodedFilterState };

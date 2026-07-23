// Explore URL state codec — `q` (search), `sort`, `f` (versioned filters), and legacy `topic`
// for curated feed when `q` is empty. Pure functions; `ExplorePage` reads `page.url` and writes
// via shallow `replaceState`.

import type { FeedTopic } from '$lib/features/discovery/types';
import type { AppliedLiteratureSearchState } from './literature-search-state.svelte';
import type { LiteratureFilterClause, LiteratureSortId } from './literature-search-types';
import { isLiteratureSortId } from './literature-search-types';

/** Topic literals accepted in the URL. */
export const TOPIC_VALUES: readonly FeedTopic[] = [
	'sains_teknologi',
	'kesehatan',
	'lingkungan',
	'sosial_ekonomi',
	'pendidikan'
];

export type ExploreUrlState = AppliedLiteratureSearchState;

type EncodedFilterState = { v: 1; clauses: LiteratureFilterClause[] };

/** Strict literal parse — any non-member (incl. `null`/garbage) → `null`, like `parseAsStringLiteral`. */
export function parseTopicParam(value: string | null | undefined): FeedTopic | null {
	return value && (TOPIC_VALUES as readonly string[]).includes(value) ? (value as FeedTopic) : null;
}

function encodeBase64Url(value: string): string {
	const bytes = new TextEncoder().encode(value);
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value: string): string | null {
	try {
		const padded = value.replace(/-/g, '+').replace(/_/g, '/');
		const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
		const binary = atob(padded + pad);
		const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
		return new TextDecoder().decode(bytes);
	} catch {
		return null;
	}
}

function decodeFilters(raw: string | null): LiteratureFilterClause[] {
	if (!raw) return [];
	const json = decodeBase64Url(raw);
	if (!json) return [];
	try {
		const parsed = JSON.parse(json) as EncodedFilterState;
		if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.clauses)) return [];
		return parsed.clauses.filter(
			(clause): clause is LiteratureFilterClause =>
				Boolean(clause) && typeof clause === 'object' && typeof clause.id === 'string'
		);
	} catch {
		return [];
	}
}

function encodeFilters(filters: LiteratureFilterClause[]): string | null {
	if (filters.length === 0) return null;
	const payload: EncodedFilterState = { v: 1, clauses: filters };
	return encodeBase64Url(JSON.stringify(payload));
}

/** Read explore state from URL search params. Missing `q` defaults to "". */
export function readExploreUrl(params: URLSearchParams): ExploreUrlState {
	const sortRaw = params.get('sort');
	return {
		q: params.get('q') ?? '',
		sort: isLiteratureSortId(sortRaw) ? sortRaw : 'relevance',
		filters: decodeFilters(params.get('f')),
		topic: parseTopicParam(params.get('topic'))
	};
}

/**
 * Apply a patch to a COPY of `params`, omitting defaults so the URL stays clean
 * (empty `q`, `sort: relevance`, empty `f`, and `null` topic drop their params).
 */
export function applyExploreUrl(
	params: URLSearchParams,
	patch: Partial<ExploreUrlState>
): URLSearchParams {
	const next = new URLSearchParams(params);
	if ('q' in patch) {
		const q = (patch.q ?? '').trim().replace(/\s+/g, ' ');
		if (q) next.set('q', q);
		else next.delete('q');
	}
	if ('sort' in patch) {
		const sort = (patch.sort ?? 'relevance') as LiteratureSortId;
		if (sort && sort !== 'relevance') next.set('sort', sort);
		else next.delete('sort');
	}
	if ('filters' in patch) {
		const encoded = encodeFilters(patch.filters ?? []);
		if (encoded) next.set('f', encoded);
		else next.delete('f');
	}
	if ('topic' in patch) {
		if (patch.topic) next.set('topic', patch.topic);
		else next.delete('topic');
	}
	return next;
}

/** Test/helper: serialize a full state to a query string starting from `base` (default empty). */
export function serializeExploreUrl(
	state: Partial<ExploreUrlState>,
	base: URLSearchParams = new URLSearchParams()
): string {
	return applyExploreUrl(base, state).toString();
}

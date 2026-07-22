// Explore URL state codec — single source of truth for `q` (search) + `topic` (feed scope).
// Pure functions here; `ExplorePage` reads `page.url` and writes via shallow `replaceState`. Contract-tested
// (`explore-url-model.spec.ts`): default `q` ("") and `null` topic omit their param; invalid topic
// parses to `null`; other params preserved; round-trip stable.

import type { FeedTopic } from '$lib/features/discovery/types';

/** Topic literals accepted in the URL. */
export const TOPIC_VALUES: readonly FeedTopic[] = [
	'sains_teknologi',
	'kesehatan',
	'lingkungan',
	'sosial_ekonomi',
	'pendidikan'
];

export type ExploreUrlState = { q: string; topic: FeedTopic | null };

/** Strict literal parse — any non-member (incl. `null`/garbage) → `null`, like `parseAsStringLiteral`. */
export function parseTopicParam(value: string | null | undefined): FeedTopic | null {
	return value && (TOPIC_VALUES as readonly string[]).includes(value) ? (value as FeedTopic) : null;
}

/** Read explore state from URL search params. Missing `q` defaults to "". */
export function readExploreUrl(params: URLSearchParams): ExploreUrlState {
	return { q: params.get('q') ?? '', topic: parseTopicParam(params.get('topic')) };
}

/**
 * Apply a single-key patch to a COPY of `params`, omitting default values so the URL stays clean
 * (empty `q` and `null` topic drop the param so defaults stay out of the URL). Returns the new
 * params; other keys are preserved. `q` is set to its trimmed form (the ask-bar submits trimmed).
 */
export function applyExploreUrl(
	params: URLSearchParams,
	patch: Partial<ExploreUrlState>
): URLSearchParams {
	const next = new URLSearchParams(params);
	if ('q' in patch) {
		const q = (patch.q ?? '').trim();
		if (q) next.set('q', q);
		else next.delete('q');
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

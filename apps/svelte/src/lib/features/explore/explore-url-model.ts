// Explore URL state codec — the single source of truth for `q` (search) + `topic` (feed scope),
// mirroring the web `nuqs` setup (`useQueryState("q", { defaultValue: "" })` +
// `useQueryState("topic", parseAsStringLiteral(TOPIC_VALUES))`). Pure functions here + `page.url`/`goto`
// in `ExplorePage` (§2.3 / THX-6 precedent — no `runed`/nuqs dep). Contract-tested byte-equivalent
// (`explore-url-model.spec.ts`): default `q` ("") and `null` topic OMIT their param; an invalid topic
// parses back to `null`; other params are preserved; round-trip is stable.

import type { FeedTopic } from '$lib/features/discovery/types';

/** Topic literals accepted in the URL (same list + order as the web `parseAsStringLiteral`). */
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

/** Read the explore state from URL search params. Missing `q` defaults to "" (the web default). */
export function readExploreUrl(params: URLSearchParams): ExploreUrlState {
	return { q: params.get('q') ?? '', topic: parseTopicParam(params.get('topic')) };
}

/**
 * Apply a single-key patch to a COPY of `params`, omitting default values so the URL stays clean
 * (empty `q` and `null` topic drop the param — parity with nuqs default-omission). Returns the new
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

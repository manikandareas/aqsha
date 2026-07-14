// Citation-marker semantics for Astra answers: `[n]` / `[n, m]` prose markers → source pills.
//
// ── DIVERGENCE FROM WEB (rehype → marked) ────────────────────────────────────────────────────────
// `apps/web` uses React `streamdown` (remark/rehype), so it ships a rehype plugin (`reportRehypePlugin`)
// that rewrites the sanitized HAST, splitting `[n]` text nodes into `<citation>` elements. `apps/svelte`
// uses `svelte-streamdown@3.1.2`, which is **marked-based** (no rehype/HAST) and ships a NATIVE inline
// citation tokenizer (`markedCitations`) producing `{type:'inline-citations', keys}` tokens. So the
// rehype pipeline is NOT portable as-is (documented in the Phase 6 decision record + §13 risk register).
//
// What stays PURE + contract-tested here is the DATA transform (which numbers a marker carries, and the
// number→cards map). The RENDER wiring lives in the Streamdown adapter (`components/ai-elements/Response`),
// which maps the native `inlineCitation` token to the Aqsha pill, resolving keys via `CitationProvider`
// context — exactly the web resolution (`CitationMarkdownComponent` → `InlineCitation`), just sourced
// from the library's tokenizer instead of our regex. Security is UNCHANGED: svelte-streamdown never
// emits raw HTML (`renderHtml` off) so the custom tag needs no sanitize allowlist.

import type { SourceCardData } from './timeline-types';

/** Token/element name + attribute of the citation marker (shared with the render component). */
export const CITATION_TAG = 'citation';
export const CITATION_ATTR = 'citations';

// `[1]`, `[1, 2]`, `[3,4,5]` — digits + commas inside a single bracket only (never touches `[teks](url)`).
export const CITATION_RE = /\[(\d+(?:\s*,\s*\d+)*)\]/g;

/** One `[n]`/`[n, m]` marker found in prose (pure — mirrors web `splitTextNode` numbering). */
export type CitationMarker = {
	/** Start index in the source text. */
	start: number;
	/** End index (exclusive) in the source text. */
	end: number;
	/** The raw match, e.g. "[1, 2]". */
	raw: string;
	/** Normalized comma-joined numbers, e.g. "1,2" (mirrors the web `citations` attribute). */
	nums: string;
};

/**
 * All citation markers in a text, in document order. Pure mirror of the web rehype `splitTextNode`
 * numbering (which numbers each `[n]` carries and how `[1, 2]` normalizes to "1,2"), extracted so the
 * transform semantics stay byte-identical and contract-tested independent of the render library.
 */
export function citationMarkersInText(text: string): CitationMarker[] {
	if (!text.includes('[')) return [];
	CITATION_RE.lastIndex = 0;
	const out: CitationMarker[] = [];
	let match: RegExpExecArray | null = CITATION_RE.exec(text);
	while (match !== null) {
		const nums = match[1]
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean)
			.join(',');
		out.push({ start: match.index, end: match.index + match[0].length, raw: match[0], nums });
		match = CITATION_RE.exec(text);
	}
	return out;
}

/**
 * Parse citation numbers from a marker's key(s) — accepts a comma-joined string ("1,2") OR the native
 * svelte-streamdown key array (`token.keys`). Non-integer keys are dropped (mirror web
 * `parseCitationNumbers` in `inline-citation.tsx`: numeric-only source map).
 */
export function parseCitationNumbers(raw: unknown): number[] {
	const parts =
		typeof raw === 'string'
			? raw.split(',')
			: Array.isArray(raw)
				? raw.flatMap((k) => (typeof k === 'string' ? k.split(',') : []))
				: [];
	const out: number[] = [];
	for (const part of parts) {
		const n = Number.parseInt(part.trim(), 10);
		if (Number.isInteger(n)) out.push(n);
	}
	return out;
}

/**
 * Resolve citation numbers → the deduped source cards to render (mirror web
 * `CitationMarkdownComponent`): expand each number via the map, dedup by `card.key`, keep first
 * occurrence. Empty when unresolved (caller renders the literal `[n]` fallback).
 */
export function resolveCitationCards(
	numbers: number[],
	map: Map<number, SourceCardData[]> | undefined
): SourceCardData[] {
	if (!map || numbers.length === 0) return [];
	const seen = new Set<string>();
	const cards: SourceCardData[] = [];
	for (const n of numbers) {
		for (const card of map.get(n) ?? []) {
			if (seen.has(card.key)) continue;
			seen.add(card.key);
			cards.push(card);
		}
	}
	return cards;
}

/**
 * `Map<number, SourceCardData[]>` from a list of source cards (chat `search-flat` with
 * `citationNumber`, or `research_sources` deep rows). One number can map to several cards (deep
 * dedups the same paper across sub-questions to one number). Cards without `citationNumber` are
 * skipped. Verbatim pure port of web `buildCitationMap`.
 */
export function buildCitationMap(cards: SourceCardData[]): Map<number, SourceCardData[]> {
	const map = new Map<number, SourceCardData[]>();
	for (const card of cards) {
		const n = card.citationNumber;
		if (n == null) continue;
		const list = map.get(n);
		if (list) list.push(card);
		else map.set(n, [card]);
	}
	return map;
}

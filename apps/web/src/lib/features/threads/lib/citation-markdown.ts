// Citation-marker semantics for Astra answers: `[n]` / `[n, m]` prose markers → source pills.
//
// svelte-streamdown is marked-based and ships a native inline citation tokenizer (`markedCitations`)
// producing `{type:'inline-citations', keys}` tokens. Pure DATA transforms (which numbers a marker
// carries, and the number→cards map) stay here, contract-tested. RENDER wiring lives in the Streamdown
// adapter (`Response.svelte`) via `CitationProvider`. Security: `renderHtml` stays off.

import type { SourceCardData } from './timeline-types';

/** Token/element name + attribute of the citation marker (shared with the render component). */
export const CITATION_TAG = 'citation';
export const CITATION_ATTR = 'citations';

// `[1]`, `[1, 2]`, `[3,4,5]` — digits + commas inside a single bracket only (never touches `[teks](url)`).
export const CITATION_RE = /\[(\d+(?:\s*,\s*\d+)*)\]/g;

/** One `[n]`/`[n, m]` marker found in prose. */
export type CitationMarker = {
	/** Start index in the source text. */
	start: number;
	/** End index (exclusive) in the source text. */
	end: number;
	/** The raw match, e.g. "[1, 2]". */
	raw: string;
	/** Normalized comma-joined numbers, e.g. "1,2". */
	nums: string;
};

/**
 * All citation markers in a text, in document order. Which numbers each `[n]` carries and how
 * `[1, 2]` normalizes to "1,2" — contract-tested independent of the render library.
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
 * svelte-streamdown key array (`token.keys`). Non-integer keys are dropped (numeric-only source map).
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
 * Resolve citation numbers → the deduped source cards to render: expand each number via the map,
 * dedup by `card.key`, keep first occurrence. Empty when unresolved (caller renders the literal `[n]`).
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
 * skipped.
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

import { describe, expect, it } from 'vitest';
import {
	buildCitationMap,
	citationMarkersInText,
	parseCitationNumbers,
	resolveCitationCards
} from './citation-markdown';
import type { SourceCardData } from './timeline-types';

// Contract tests for the citation transform semantics (THC-2). The RENDER goes through
// svelte-streamdown's native citation tokenizer, but the DATA transform (which numbers a marker
// carries, and number→cards resolution) is pinned here byte-for-byte against the web behavior.

const card = (n: number, key: string): SourceCardData => ({
	key,
	title: key,
	url: `https://example.com/${key}`,
	doi: null,
	origin: 'web',
	citationNumber: n
});

describe('citationMarkersInText', () => {
	it('finds single and grouped markers, normalizing "[1, 2]" → "1,2"', () => {
		const markers = citationMarkersInText('Bukti [1] dan gabungan [1, 2] serta [3,4,5].');
		expect(markers.map((m) => m.nums)).toEqual(['1', '1,2', '3,4,5']);
	});

	it('does not match non-numeric brackets or markdown links', () => {
		// `[ref]` (non-numeric) and `[teks](url)` never match. NOTE: a numeric bracket in prose like
		// `arr[0]` DOES match by design (web `CITATION_RE` parity) — array indexing is protected only
		// inside code spans, which is a RENDER concern (SKIP_TAGS / marked code token), not a parse one.
		expect(citationMarkersInText('lihat [ref] dan [teks](https://x.com)')).toEqual([]);
	});

	it('returns document-order positions', () => {
		const [a, b] = citationMarkersInText('x [1] y [2]');
		expect(a.start).toBeLessThan(b.start);
		expect(a.raw).toBe('[1]');
	});

	it('is stateless across calls (no shared lastIndex)', () => {
		const t = 'a [1] b';
		expect(citationMarkersInText(t)).toHaveLength(1);
		expect(citationMarkersInText(t)).toHaveLength(1);
	});
});

describe('parseCitationNumbers', () => {
	it('parses a comma-joined string', () => {
		expect(parseCitationNumbers('1,2')).toEqual([1, 2]);
	});
	it('parses the native key array and drops non-integers', () => {
		expect(parseCitationNumbers(['1', 'ref', '3'])).toEqual([1, 3]);
	});
	it('returns [] for junk', () => {
		expect(parseCitationNumbers(null)).toEqual([]);
	});
});

describe('buildCitationMap', () => {
	it('maps citationNumber → cards, allowing many cards per number', () => {
		const map = buildCitationMap([card(1, 'a'), card(1, 'b'), card(2, 'c')]);
		expect(map.get(1)?.map((c) => c.key)).toEqual(['a', 'b']);
		expect(map.get(2)?.map((c) => c.key)).toEqual(['c']);
	});
	it('skips cards without a citationNumber', () => {
		const map = buildCitationMap([{ ...card(0, 'x'), citationNumber: null }]);
		expect(map.size).toBe(0);
	});
});

describe('resolveCitationCards', () => {
	const map = buildCitationMap([card(1, 'a'), card(1, 'b'), card(2, 'b')]);

	it('expands numbers → cards, deduping by key', () => {
		// number 1 → [a,b], number 2 → [b]; dedup keeps first occurrence of b.
		expect(resolveCitationCards([1, 2], map).map((c) => c.key)).toEqual(['a', 'b']);
	});
	it('returns [] when unresolved (fallback to literal [n])', () => {
		expect(resolveCitationCards([9], map)).toEqual([]);
		expect(resolveCitationCards([1], undefined)).toEqual([]);
	});
});

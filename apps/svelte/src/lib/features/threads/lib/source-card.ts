// Source → card adapter (consistent favicon). One `SourceCardData` shape shared by both paths:
// (1) `search_*` tool results streaming/rehydrated (normal & deep live), and (2) `research_sources`
// rows from the DB (numbered `[n]` deep panel). Pure: no fetch, no DB — only maps to the neutral
// presentation contract. Port of `apps/web/features/threads/lib/source-card.ts`.
//
// Svelte divergence: `@hugeicons/svelte` renders glyphs as DATA (`IconSvgElement`) via one
// `HugeiconsIcon`, so `originMeta` returns the glyph `icon` (not a component). Same glyph mapping
// as web (`$lib/icons` mirrors `@aqsha/ui/icons`).

import { BookOpenIcon, FileTextIcon, GlobeIcon, type IconSvgElement } from '$lib/icons';
import type { ResearchSource } from '../types';
import type { SourceCardData } from './timeline-types';

/** Icon + label per source class (`origin`) — neutral presentation contract used by panel & deep card. */
export function originMeta(origin: string): { icon: IconSvgElement; label: string } {
	switch (origin) {
		case 'arxiv':
			return { icon: FileTextIcon, label: 'arXiv' };
		case 'doi':
			return { icon: BookOpenIcon, label: 'Makalah' };
		default:
			return { icon: GlobeIcon, label: 'Web' };
	}
}

/** Outbound link for one source: `url` → `doi.org/<doi>` → null. */
export function sourceHref(source: { url: string | null; doi: string | null }): string | null {
	return source.url ?? (source.doi ? `https://doi.org/${source.doi}` : null);
}

/** Domain (without `www.`) from `sourceHref`, derived client-side. Null when absent/invalid. */
export function sourceDomain(source: { url: string | null; doi: string | null }): string | null {
	const raw = sourceHref(source);
	if (!raw) return null;
	try {
		return new URL(raw).hostname.replace(/^www\./, '');
	} catch {
		return null;
	}
}

/** Google s2 favicon from domain (consistent discovery/source pattern). Null when domain null. */
export function faviconUrl(domain: string | null): string | null {
	return domain
		? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`
		: null;
}

function str(v: unknown): string {
	return typeof v === 'string' ? v : '';
}
function strOrNull(v: unknown): string | null {
	return typeof v === 'string' && v.length > 0 ? v : null;
}

/** Dedup key + stable react-key: doi → url → arxivId → title. */
function cardKey(raw: Record<string, unknown>): string {
	return (
		strOrNull(raw.doi) ?? strOrNull(raw.url) ?? strOrNull(raw.arxivId) ?? str(raw.title) ?? 'src'
	);
}

/**
 * Map a raw results array (`toResearchToolOutput().results` from stream/rehydrate, or `sources`
 * emitted by a deep step) → cards. Entries without a title are dropped.
 */
export function toCards(raw: unknown): SourceCardData[] {
	if (!Array.isArray(raw)) return [];
	const cards: SourceCardData[] = [];
	for (const item of raw) {
		if (!item || typeof item !== 'object') continue;
		const r = item as Record<string, unknown>;
		const title = str(r.title);
		if (!title) continue;
		cards.push({
			key: cardKey(r),
			title,
			url: strOrNull(r.url),
			doi: strOrNull(r.doi),
			origin: str(r.origin) || 'web',
			snippet: str(r.snippet) || undefined,
			// `n` (global per-turn citation number from tool output) → `citationNumber`, so `search-flat`
			// chat cards (live + rehydrate) map to `[n]` in the prose (inline citation pill).
			citationNumber: typeof r.n === 'number' ? r.n : null
		});
	}
	return cards;
}

/** `research_sources` row (DB) → card — carries the `citationNumber` `[n]` for the deep panel. */
export function researchSourceToCard(s: ResearchSource): SourceCardData {
	return {
		key: s.id,
		title: s.title,
		url: s.url,
		doi: s.doi,
		origin: s.origin,
		snippet: s.snippet || undefined,
		citationNumber: s.citationNumber
	};
}

/** Dedup cards by `key` (keep first occurrence) — a turn can have several search tools. */
export function dedupeCards(cards: SourceCardData[]): SourceCardData[] {
	const seen = new Set<string>();
	const out: SourceCardData[] = [];
	for (const c of cards) {
		if (seen.has(c.key)) continue;
		seen.add(c.key);
		out.push(c);
	}
	return out;
}

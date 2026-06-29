// Adapter sumber → kartu (favicon konsisten). Satu bentuk `SourceCardData` dipakai bersama oleh
// kedua jalur: (1) hasil tool `search_*` yang mengalir di stream / ter-rehydrate (chat normal &
// deep live), dan (2) baris `research_sources` dari DB (panel deep bernomor `[n]`). Pure: tak
// fetch, tak sentuh DB — hanya memetakan ke kontrak presentasi netral.

import type { ResearchSource } from "../types";
import type { SourceCardData } from "./timeline-types";

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Kunci dedup + react-key stabil: doi → url → arxivId → judul. */
function cardKey(raw: Record<string, unknown>): string {
  return (
    strOrNull(raw.doi) ??
    strOrNull(raw.url) ??
    strOrNull(raw.arxivId) ??
    str(raw.title) ??
    "src"
  );
}

/**
 * Petakan array hasil mentah (`toResearchToolOutput().results` dari stream/rehydrate, atau
 * `sources` yang dipancarkan step deep) → kartu. Entri tanpa judul dibuang.
 */
export function toCards(raw: unknown): SourceCardData[] {
  if (!Array.isArray(raw)) return [];
  const cards: SourceCardData[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const title = str(r.title);
    if (!title) continue;
    cards.push({
      key: cardKey(r),
      title,
      url: strOrNull(r.url),
      doi: strOrNull(r.doi),
      origin: str(r.origin) || "web",
      snippet: str(r.snippet) || undefined,
    });
  }
  return cards;
}

/** Baris `research_sources` (DB) → kartu — membawa `citationNumber` `[n]` untuk panel deep. */
export function researchSourceToCard(s: ResearchSource): SourceCardData {
  return {
    key: s.id,
    title: s.title,
    url: s.url,
    doi: s.doi,
    origin: s.origin,
    snippet: s.snippet || undefined,
    citationNumber: s.citationNumber,
  };
}

/** Dedup kartu by `key` (pertahankan kemunculan pertama) — turn bisa punya beberapa tool search. */
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

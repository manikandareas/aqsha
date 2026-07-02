// Adapter sumber → kartu (favicon konsisten). Satu bentuk `SourceCardData` dipakai bersama oleh
// kedua jalur: (1) hasil tool `search_*` yang mengalir di stream / ter-rehydrate (chat normal &
// deep live), dan (2) baris `research_sources` dari DB (panel deep bernomor `[n]`). Pure: tak
// fetch, tak sentuh DB — hanya memetakan ke kontrak presentasi netral.

import { BookOpenIcon, FileTextIcon, GlobeIcon } from "@aqsha/ui/icons";
import type { ResearchSource } from "../types";
import type { SourceCardData } from "./timeline-types";

/** Ikon + label per kelas sumber (`origin`) — kontrak presentasi netral dipakai panel & kartu deep. */
export function originMeta(origin: string): { Icon: typeof GlobeIcon; label: string } {
  switch (origin) {
    case "arxiv":
      return { Icon: FileTextIcon, label: "arXiv" };
    case "doi":
      return { Icon: BookOpenIcon, label: "Makalah" };
    default:
      return { Icon: GlobeIcon, label: "Web" };
  }
}

/** Tautan keluar satu sumber: `url` → `doi.org/<doi>` → null. */
export function sourceHref(source: { url: string | null; doi: string | null }): string | null {
  return source.url ?? (source.doi ? `https://doi.org/${source.doi}` : null);
}

/** Domain (tanpa `www.`) dari `sourceHref`, diturunkan client-side. Null bila tak ada/invalid. */
export function sourceDomain(source: { url: string | null; doi: string | null }): string | null {
  const raw = sourceHref(source);
  if (!raw) return null;
  try {
    return new URL(raw).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Favicon Google s2 dari domain (pola konsisten discovery/sumber). Null bila domain null. */
export function faviconUrl(domain: string | null): string | null {
  return domain
    ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`
    : null;
}

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
      // `n` (nomor sitasi global per-turn dari tool output) → `citationNumber`, supaya kartu
      // `search-flat` chat (live + rehydrate) memetakan ke `[n]` di prosa (pill sitasi inline).
      citationNumber: typeof r.n === "number" ? r.n : null,
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

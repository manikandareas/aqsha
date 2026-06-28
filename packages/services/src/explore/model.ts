/**
 * Explore paper model — cache `explore_papers` bersama (P4). Port V1 `explore/validators` +
 * `explore/model` (key kanonik + cache-key + probe). Dependency-free leaf (kecuali identifiers).
 *
 * Provider Title-case (beda dari feed provider). `key` kanonik `doi:`/`arxiv:`/`url:`/`title:`
 * = identitas paper bersama yang dirujuk `feed_items.paper_key` + di-probe getOrFetchPaper.
 */
import type { NewExplorePaper } from "@aqsha/db";
import { extractArxivId, normalizeDoi } from "../papers/identifiers";
import { collapse } from "../lib/text";

export type ExploreProvider = "OpenAlex" | "arXiv" | "Exa" | "Jina" | "Crossref";
export type ExploreMode = "recommendations" | "search";

/** Input write explore_papers (explorePaperFields; `lastSeenAt` di-set saat upsert). */
export type ExplorePaperInput = {
  key: string;
  title: string;
  snippet: string;
  abstract?: string;
  url: string;
  pdfUrl?: string;
  doi?: string;
  arxivId?: string;
  openalexId?: string;
  provider: ExploreProvider;
  sourceLabel: string;
  authors: string[];
  year?: number;
  publicationDate?: string;
  venue?: string;
  citedByCount?: number;
  isOpenAccess?: boolean;
  topics: string[];
  score?: number;
};

/** Paper detail (input + lastSeenAt + enrichment OpenAlex opsional) — kontrak GET /papers/detail. */
export type ExplorePaperDetail = ExplorePaperInput & {
  lastSeenAt: number;
  enriched?: PaperEnrichment;
};

/** Satu paper terkait (referensi / dikutip-oleh) — judul + identitas untuk tautan eksternal. */
export type PaperEnrichmentRef = {
  openalexId: string;
  title: string;
  year?: number;
  doi?: string;
  citedByCount?: number;
};

/** Penulis dengan afiliasi (dari authorships OpenAlex). */
export type PaperEnrichmentAuthor = {
  name: string;
  institution?: string;
  country?: string;
};

/** Skor sitasi per tahun (counts_by_year) untuk sparkline tren. */
export type PaperYearCount = { year: number; citedByCount: number };

/** Konsep/topik atau SDG berbobot. */
export type PaperWeighted = { name: string; score?: number };

/**
 * Enrichment paper dari OpenAlex single-work (`GET /works/{id}`). Best-effort & Redis-cached;
 * `enriched` di-omit kalau tak ada `openalexId` atau fetch gagal. Field tambahan yang TIDAK ada
 * di cache `explore_papers`: tren sitasi, afiliasi, referensi/dikutip-oleh ber-judul, SDG, funding.
 */
export type PaperEnrichment = {
  oaStatus?: string;
  oaUrl?: string;
  license?: string;
  journal?: string;
  issn?: string[];
  type?: string;
  language?: string;
  fwci?: number;
  citationPercentile?: number;
  countsByYear: PaperYearCount[];
  authors: PaperEnrichmentAuthor[];
  institutions: string[];
  countries: string[];
  concepts: PaperWeighted[];
  sdgs: PaperWeighted[];
  funders: string[];
  referencedCount: number;
  references: PaperEnrichmentRef[];
  citedByCount?: number;
  citedBy: PaperEnrichmentRef[];
  relatedCount: number;
};

export type ExploreProviderStatus = {
  provider: ExploreProvider;
  status: "ready" | "fallback" | "skipped" | "error";
  message?: string;
};

export type ExploreSearchResponse = {
  items: ExplorePaperInput[];
  mode: ExploreMode;
  query: string;
  providerStatus: ExploreProviderStatus[];
  generatedAt: number;
  cached: boolean;
};

const PROVIDER_RANK: ExploreProvider[] = ["OpenAlex", "arXiv", "Exa", "Jina", "Crossref"];
export function providerRank(provider: ExploreProvider): number {
  return PROVIDER_RANK.indexOf(provider);
}

function normalizeUrlKey(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

/**
 * Kunci kanonik paper (port V1 canonicalSourceKey): `doi:` → `arxiv:` → `url:` → `title:`.
 * Deterministik supaya feed materialize, explore search, dan getOrFetchPaper merujuk baris sama.
 */
export function canonicalPaperKey(source: {
  doi?: string;
  arxivId?: string;
  url?: string;
  locator?: string;
  title?: string;
}): string {
  const doi = source.doi ? normalizeDoi(source.doi) : "";
  if (doi) return `doi:${doi}`;
  const arxivId = extractArxivId(source.arxivId || source.url || source.locator || "");
  if (arxivId) return `arxiv:${arxivId}`;
  const url = normalizeUrlKey(source.url || source.locator);
  if (url) return `url:${url}`;
  return `title:${collapse(source.title ?? "").toLowerCase()}`;
}

/**
 * Probe provider dari key kanonik (port V1 deriveKeyProbe) — getOrFetchPaper cold miss.
 * `doi:`/`arxiv:` membawa identifier; lainnya jadi query keyword.
 */
export function deriveKeyProbe(
  key: string,
): { query: string; doi?: string; arxivId?: string } | null {
  const sep = key.indexOf(":");
  if (sep === -1) return key.trim() ? { query: key.trim() } : null;
  const scheme = key.slice(0, sep);
  const value = key.slice(sep + 1).trim();
  if (!value) return null;
  if (scheme === "doi") return { query: value, doi: value };
  if (scheme === "arxiv") return { query: value, arxivId: value };
  return { query: value };
}

/** Cache key explore (port V1 exploreCacheKey) — date-bucketed + seed per-user. */
export function exploreCacheKey(args: {
  mode: ExploreMode;
  query: string;
  limit: number;
  fromYear?: number;
  seed?: string;
  now: number;
}): string {
  const dateBucket = new Date(args.now).toISOString().slice(0, 10);
  const yearBucket = args.fromYear ?? "all";
  const q = collapse(args.query).toLowerCase();
  const base = `explore:v2:${args.mode}:${q}:${args.limit}:${yearBucket}:${dateBucket}`;
  const seed = args.seed?.trim().toLowerCase();
  return seed ? `${base}:seed:${seed}` : base;
}

/** Dedup candidate by key + provider-rank (port V1 candidatesToExplorePapers). */
export function dedupeExplorePapers(papers: ExplorePaperInput[], limit: number): ExplorePaperInput[] {
  const byKey = new Map<string, ExplorePaperInput>();
  for (const paper of papers) {
    const existing = byKey.get(paper.key);
    if (!existing || providerRank(paper.provider) < providerRank(existing.provider)) {
      byKey.set(paper.key, paper);
    }
    if (byKey.size >= limit) break;
  }
  return [...byKey.values()].slice(0, limit);
}

/** ExplorePaperInput → row Drizzle explore_papers (+ lastSeenAt). */
export function explorePaperToRow(paper: ExplorePaperInput, lastSeenAt: number): NewExplorePaper {
  return { ...paper, lastSeenAt };
}

export const DEFAULT_RECOMMENDATION_QUERY =
  "education research learning assessment artificial intelligence";

export function normalizeExploreQuery(query?: string): string {
  return collapse(query ?? "");
}

/** Query provider untuk mode recommendations: topik minat (space-joined) atau fallback. */
export function recommendationProviderQuery(interestTopics: string[], fallback: string): string {
  const cleaned = interestTopics.map((t) => t.trim()).filter((t) => t.length > 0);
  return cleaned.length > 0 ? cleaned.join(" ") : fallback;
}

/**
 * Query OpenAlex spesifik: search verbatim; recommendations = topik minat join, atau ""
 * (trending cited_by_count) saat cold-start. Port V1 openAlexRecommendationQuery.
 */
export function openAlexRecommendationQuery(query: string, interestTopics: string[]): string {
  return query || recommendationProviderQuery(interestTopics, "");
}

/** Clamp limit 1..24 (default 12). Non-finite → null (caller surface explore_limit_invalid). */
export function clampExploreLimit(limit: number | undefined): number | null {
  if (limit === undefined) return 12;
  if (!Number.isFinite(limit)) return null;
  return Math.min(Math.max(Math.floor(limit), 1), 24);
}

/** Clamp fromYear 1900..2100; di luar / non-finite → undefined (diabaikan). */
export function clampFromYear(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  const year = Math.floor(value);
  return year < 1900 || year > 2100 ? undefined : year;
}

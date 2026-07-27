/**
 * OpenAlexService — service-path OpenAlex `works` fetch untuk lane feed (trending papers,
 * + nanti claim-supporting/consensus). Work dinormalisasi lewat mapper bersama di
 * `papers/work.ts`, jadi paper hasil lane ini identik dengan paper hasil pencarian literatur.
 * Cache via Redis external-cache (getCache/putCache, 24h ready). TANPA per-user credit
 * (cron tak punya user); cache = pacer.
 */
import { getCache, putCache } from "../papers/external-cache";
import { fetchWithTimeout } from "../papers/http";
import { normalizeDoi } from "../papers/identifiers";
import {
  LITERATURE_WORK_SELECT,
  mapOpenAlexWork,
  type LiteraturePaper,
  type OpenAlexWorkPayload,
} from "../papers/work";

const OPENALEX_ENDPOINT = "https://api.openalex.org/works";

/** Work OpenAlex sebagaimana dikonsumsi feed; `related_works` khusus graf kemiripan. */
export type OpenAlexWork = OpenAlexWorkPayload & { related_works?: string[] | null };

function normalizeFromYear(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  const year = Math.floor(value);
  if (year < 1900 || year > 2100) return undefined;
  return year;
}

/** Build URL `works` (port V1). Empty query → trending cited_by_count:desc; else relevance. */
export function buildOpenAlexWorksUrl(args: {
  apiKey: string;
  query: string;
  limit: number;
  includeRetracted?: boolean;
  fromYear?: number;
  /** Halaman basic-paging OpenAlex (>1 → `page`); default 1. Untuk load-more search. */
  page?: number;
}): URL {
  const query = args.query.trim();
  const retractionFilter = args.includeRetracted ? "" : "is_retracted:false,";
  const fromYear = normalizeFromYear(args.fromYear);
  const url = new URL(OPENALEX_ENDPOINT);
  url.searchParams.set("api_key", args.apiKey);
  url.searchParams.set("per_page", String(args.limit));
  if (args.page && args.page > 1) url.searchParams.set("page", String(args.page));
  url.searchParams.set("select", LITERATURE_WORK_SELECT);
  if (query) {
    const dateFilter = fromYear ? `,from_publication_date:${fromYear}-01-01` : "";
    url.searchParams.set("filter", `${retractionFilter}is_paratext:false${dateFilter}`);
    url.searchParams.set("search", query);
    url.searchParams.set("sort", "relevance_score:desc");
  } else {
    url.searchParams.set("sort", "cited_by_count:desc");
    url.searchParams.set(
      "filter",
      `${retractionFilter}is_paratext:false,from_publication_date:${fromYear ?? 2021}-01-01`,
    );
  }
  return url;
}

export function normalizeDoiLoose(value: string | null | undefined): string {
  return value ? normalizeDoi(value) : "";
}

/** Identifier (openalexId + doi) untuk mencocokkan paper ke raw work (retraction). */
export function workIdentifiers(work: OpenAlexWork): string[] {
  const ids: string[] = [];
  const openalexId = work.ids?.openalex ?? work.id ?? undefined;
  if (openalexId) ids.push(openalexId);
  const doi = normalizeDoiLoose(work.ids?.doi ?? work.doi ?? undefined);
  if (doi) ids.push(doi);
  return ids;
}

/**
 * Fetch OpenAlex works (cache 24h) → ExplorePaperInput[] + raw works. Soft-fail: cache hit
 * di-parse balik; tanpa API key → throw (config error, di-surface health). Empty results
 * di-cache status "empty" (retry lebih cepat).
 */
export async function fetchOpenAlexWorks(args: {
  query: string;
  limit: number;
  includeRetracted?: boolean;
  fromYear?: number;
  page?: number;
  now?: number;
}): Promise<{ papers: LiteraturePaper[]; works: OpenAlexWork[] }> {
  const query = args.query.trim();
  const limit = Math.min(Math.max(args.limit, 1), 50);
  const includeRetracted = args.includeRetracted ?? false;
  const page = args.page && args.page > 1 ? args.page : 1;
  // `fromYear` ikut ke cache key: buildOpenAlexWorksUrl memfilter tahun, jadi tanpa ini dua
  // pencarian query/limit/page sama tapi fromYear beda akan tabrakan (hasil salah-tahun).
  const yearBucket = args.fromYear ?? "all";
  const now = args.now ?? Date.now();
  const dateBucket = new Date(now).toISOString().slice(0, 10);
  const cacheKey = `feed:works:${includeRetracted ? "ret" : "noret"}:${limit}:p${page}:y${yearBucket}:${query}:${dateBucket}`;

  const cached = await getCache("openalex", cacheKey);
  if (cached) {
    try {
      const works = JSON.parse(cached.valueJson) as OpenAlexWork[];
      return { works, papers: worksToPapers(works, limit) };
    } catch {
      // fall through to refetch
    }
  }

  const apiKey = process.env.OPENALEX_API_KEY;
  if (!apiKey) throw new Error("OPENALEX_API_KEY is not configured");

  const url = buildOpenAlexWorksUrl({ apiKey, query, limit, includeRetracted, fromYear: args.fromYear, page });
  const response = await fetchWithTimeout(url.toString(), { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`OpenAlex returned ${response.status}`);
  const json = (await response.json()) as { results?: OpenAlexWork[] };
  const works = json.results ?? [];

  await putCache("openalex", cacheKey, works.length > 0 ? "ready" : "empty", JSON.stringify(works));
  return { works, papers: worksToPapers(works, limit) };
}

const OPENALEX_SEMANTIC_SELECT = [
  "id",
  "doi",
  "title",
  "display_name",
  "publication_year",
  "publication_date",
  "cited_by_count",
  "is_retracted",
  "primary_location",
  "best_oa_location",
  "open_access",
  "authorships",
  "primary_topic",
  "topics",
  "related_works",
  "ids",
];

/**
 * URL `works` dengan `search.semantic` (pencarian berbasis MAKNA OpenAlex, embedding GTE-Large
 * atas ~217jt work). Maks 50 hasil/query, input dipotong ≤2000 char. `search.semantic` HANYA
 * menerima subset filter (a.l. is_retracted, is_oa, has_abstract, publication_year); `is_paratext`,
 * `from_publication_date`, `cited_by_count`, & `country_code` DITOLAK (HTTP 400) → pakai
 * is_retracted + publication_year saja.
 */
export function buildOpenAlexSemanticUrl(args: {
  apiKey: string;
  query: string;
  limit: number;
  fromYear?: number;
}): URL {
  const fromYear = normalizeFromYear(args.fromYear);
  const url = new URL(OPENALEX_ENDPOINT);
  url.searchParams.set("api_key", args.apiKey);
  url.searchParams.set("per_page", String(Math.min(Math.max(args.limit, 1), 50)));
  url.searchParams.set("select", OPENALEX_SEMANTIC_SELECT.join(","));
  url.searchParams.set("search.semantic", args.query.trim().slice(0, 2000));
  const filters = ["is_retracted:false"];
  if (fromYear) filters.push(`publication_year:>${fromYear - 1}`);
  url.searchParams.set("filter", filters.join(","));
  return url;
}

/**
 * Fetch OpenAlex `search.semantic` (cache 24h) → raw works (dgn `related_works` untuk graf
 * kemiripan Constellation). BERBAYAR (~$0.001/query) tapi diredam cache per-seed. Query kosong →
 * works kosong (semantic butuh teks; pemanggil fallback ke trending). Tanpa API key → throw.
 */
export async function fetchOpenAlexSemantic(args: {
  query: string;
  limit: number;
  fromYear?: number;
  now?: number;
}): Promise<{ works: OpenAlexWork[] }> {
  const query = args.query.trim();
  if (!query) return { works: [] };
  const limit = Math.min(Math.max(args.limit, 1), 50);
  const now = args.now ?? Date.now();
  const dateBucket = new Date(now).toISOString().slice(0, 10);
  const cacheKey = `feed:semantic:${limit}:${args.fromYear ?? ""}:${query}:${dateBucket}`;

  const cached = await getCache("openalex", cacheKey);
  if (cached) {
    try {
      return { works: JSON.parse(cached.valueJson) as OpenAlexWork[] };
    } catch {
      // fall through to refetch
    }
  }

  const apiKey = process.env.OPENALEX_API_KEY;
  if (!apiKey) throw new Error("OPENALEX_API_KEY is not configured");

  const url = buildOpenAlexSemanticUrl({ apiKey, query, limit, fromYear: args.fromYear });
  const response = await fetchWithTimeout(url.toString(), { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`OpenAlex semantic returned ${response.status}`);
  const json = (await response.json()) as { results?: OpenAlexWork[] };
  const works = json.results ?? [];

  await putCache("openalex", cacheKey, works.length > 0 ? "ready" : "empty", JSON.stringify(works));
  return { works };
}

/** Satu bucket agregat OpenAlex `group_by` (key + label + count). */
export type OpenAlexGroup = { key: string; label: string; count: number };

/**
 * Agregat OpenAlex `group_by` (faceting) — dipakai Explore facets: tren per-tahun
 * (`publication_year`) untuk Pulse chart & sebaran negara (`authorships.institutions.country_code`)
 * untuk Globe. Empty query → seluruh korpus (trending). Cache 24h via external-cache.
 */
export async function fetchOpenAlexGroupBy(args: {
  query: string;
  groupBy: string;
  fromYear?: number;
  /** Klausa filter ekstra (mis. `primary_topic.subfield.id:1702`), di-AND ke filter dasar. */
  filter?: string;
  now?: number;
}): Promise<OpenAlexGroup[]> {
  const query = args.query.trim();
  const now = args.now ?? Date.now();
  const dateBucket = new Date(now).toISOString().slice(0, 10);
  const fromYear = normalizeFromYear(args.fromYear);
  const extraFilter = args.filter?.trim() ?? "";
  const cacheKey = `feed:groupby:${args.groupBy}:${fromYear ?? ""}:${extraFilter}:${query}:${dateBucket}`;

  const cached = await getCache("openalex", cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached.valueJson) as OpenAlexGroup[];
    } catch {
      // fall through
    }
  }

  const apiKey = process.env.OPENALEX_API_KEY;
  if (!apiKey) throw new Error("OPENALEX_API_KEY is not configured");

  const url = new URL(OPENALEX_ENDPOINT);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("group_by", args.groupBy);
  // group_by membatasi jumlah bucket ke `per_page` saat ada filter/search → 1 akan
  // mengkerutkan tren multi-tahun jadi satu titik. 200 = max group_by OpenAlex; daftar
  // `results` tetap kosong untuk query group_by, jadi tanpa biaya payload.
  url.searchParams.set("per_page", "200");
  const filters = ["is_paratext:false"];
  if (fromYear) filters.push(`from_publication_date:${fromYear}-01-01`);
  if (extraFilter) filters.push(extraFilter);
  url.searchParams.set("filter", filters.join(","));
  if (query) url.searchParams.set("search", query);

  const response = await fetchWithTimeout(url.toString(), { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`OpenAlex group_by returned ${response.status}`);
  const json = (await response.json()) as {
    group_by?: Array<{ key?: string | number; key_display_name?: string | null; count?: number }>;
  };
  const groups: OpenAlexGroup[] = (json.group_by ?? [])
    .filter((g) => g.key != null)
    .map((g) => ({
      key: String(g.key),
      label: g.key_display_name ?? String(g.key),
      count: g.count ?? 0,
    }));

  await putCache("openalex", cacheKey, groups.length > 0 ? "ready" : "empty", JSON.stringify(groups));
  return groups;
}

/** Tren volume publikasi per tahun untuk sebuah topik (Pulse chart). */
export function fetchOpenAlexYearCounts(args: { query: string; fromYear?: number }) {
  return fetchOpenAlexGroupBy({ query: args.query, groupBy: "publication_year", fromYear: args.fromYear });
}

function worksToPapers(works: OpenAlexWork[], limit: number): LiteraturePaper[] {
  const byKey = new Map<string, LiteraturePaper>();
  for (const work of works) {
    const paper = mapOpenAlexWork(work);
    if (paper && !byKey.has(paper.key)) byKey.set(paper.key, paper);
    if (byKey.size >= limit) break;
  }
  return [...byKey.values()];
}

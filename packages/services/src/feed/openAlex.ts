/**
 * OpenAlexService — service-path OpenAlex `works` fetch untuk lane feed (trending papers,
 * + nanti claim-supporting/consensus). Port V1 `feed/openAlex.ts` + `agent/providers/
 * openalexProvider.ts`, di-decouple dari ExternalCandidate: map work → ExplorePaperInput
 * langsung. Cache via Redis external-cache (getCache/putCache, 24h ready). TANPA per-user
 * credit (cron tak punya user); cache = pacer.
 */
import { getCache, putCache } from "../papers/external-cache";
import { fetchWithTimeout } from "../papers/http";
import { reconstructOpenAlexAbstract } from "../papers/providers";
import { normalizeDoi } from "../papers/identifiers";
import { collapse, firstNonEmpty, numberOrUndefined, uniqueCompact } from "../lib/text";
import {
  canonicalPaperKey,
  dedupeExplorePapers,
  type ExplorePaperInput,
} from "../explore/model";

const OPENALEX_ENDPOINT = "https://api.openalex.org/works";

const OPENALEX_SELECT_FIELDS = [
  "id",
  "doi",
  "title",
  "display_name",
  "publication_year",
  "publication_date",
  "cited_by_count",
  "is_retracted",
  "abstract_inverted_index",
  "primary_location",
  "best_oa_location",
  "open_access",
  "authorships",
  "primary_topic",
  "topics",
  "ids",
];

type OpenAlexLocation = {
  landing_page_url?: string | null;
  pdf_url?: string | null;
  is_oa?: boolean | null;
  source?: { display_name?: string | null; host_organization_name?: string | null } | null;
};
type OpenAlexTopic = {
  display_name?: string | null;
  score?: number | null;
  field?: { display_name?: string | null } | null;
  subfield?: { display_name?: string | null } | null;
};

/** Superset field OpenAlex `works` yang dikonsumsi feed (semua optional, additive). */
export type OpenAlexWork = {
  id?: string;
  doi?: string | null;
  title?: string | null;
  display_name?: string | null;
  publication_year?: number | null;
  publication_date?: string | null;
  cited_by_count?: number | null;
  is_retracted?: boolean | null;
  abstract_inverted_index?: Record<string, number[]> | null;
  primary_location?: OpenAlexLocation | null;
  best_oa_location?: OpenAlexLocation | null;
  open_access?: { is_oa?: boolean | null; oa_status?: string | null; oa_url?: string | null } | null;
  authorships?: Array<{
    author?: { display_name?: string | null } | null;
    raw_author_name?: string | null;
    countries?: string[] | null;
    institutions?: Array<{
      id?: string | null;
      display_name?: string | null;
      country_code?: string | null;
    }> | null;
  }> | null;
  primary_topic?: OpenAlexTopic | null;
  topics?: OpenAlexTopic[] | null;
  /** ID OpenAlex work terkait (algoritmik, konsep paling tumpang-tindih) — edge constellation. */
  related_works?: string[] | null;
  ids?: { openalex?: string | null; doi?: string | null } | null;
};

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
}): URL {
  const query = args.query.trim();
  const retractionFilter = args.includeRetracted ? "" : "is_retracted:false,";
  const fromYear = normalizeFromYear(args.fromYear);
  const url = new URL(OPENALEX_ENDPOINT);
  url.searchParams.set("api_key", args.apiKey);
  url.searchParams.set("per_page", String(args.limit));
  url.searchParams.set("select", OPENALEX_SELECT_FIELDS.join(","));
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

function trimSnippet(value: string, max: number): string {
  const clean = collapse(value);
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/** Map satu OpenAlex work → ExplorePaperInput (port openAlexWorkToCandidate + candidateToExplorePaper). */
export function openAlexWorkToExplorePaper(work: OpenAlexWork): ExplorePaperInput | null {
  const title = collapse(work.display_name ?? work.title ?? "");
  const openalexId = work.ids?.openalex ?? work.id ?? undefined;
  const doi = normalizeDoi(work.ids?.doi ?? work.doi ?? "");
  const location = work.best_oa_location ?? work.primary_location ?? null;
  const url = firstNonEmpty(
    work.open_access?.oa_url,
    location?.landing_page_url,
    doi ? `https://doi.org/${doi}` : null,
    openalexId,
  );
  if (!title || !url) return null;

  const topics = uniqueCompact([
    work.primary_topic?.display_name,
    work.primary_topic?.subfield?.display_name,
    work.primary_topic?.field?.display_name,
    ...(work.topics ?? []).map((t) => t.display_name),
  ]).slice(0, 5);
  const abstract = reconstructOpenAlexAbstract(work.abstract_inverted_index);
  const authors = (work.authorships ?? [])
    .map((a) => collapse(a.author?.display_name ?? a.raw_author_name ?? ""))
    .filter(Boolean)
    .slice(0, 6);
  const sourceLabel = collapse(location?.source?.display_name ?? "") || "OpenAlex";

  return {
    key: canonicalPaperKey({ doi: doi || undefined, url, title }),
    title,
    snippet:
      trimSnippet(abstract, 1_200) ||
      trimSnippet(topics.join(", "), 1_200) ||
      "OpenAlex metadata result.",
    abstract: collapse(abstract) || undefined,
    url,
    pdfUrl: location?.pdf_url ?? undefined,
    doi: doi || undefined,
    openalexId,
    provider: "OpenAlex",
    sourceLabel,
    authors,
    year: numberOrUndefined(work.publication_year),
    publicationDate: work.publication_date ?? undefined,
    venue: collapse(location?.source?.display_name ?? "") || undefined,
    citedByCount: numberOrUndefined(work.cited_by_count),
    isOpenAccess: Boolean(work.open_access?.is_oa ?? location?.is_oa),
    topics,
    score: numberOrUndefined(work.primary_topic?.score),
  };
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
  now?: number;
}): Promise<{ papers: ExplorePaperInput[]; works: OpenAlexWork[] }> {
  const query = args.query.trim();
  const limit = Math.min(Math.max(args.limit, 1), 50);
  const includeRetracted = args.includeRetracted ?? false;
  const now = args.now ?? Date.now();
  const dateBucket = new Date(now).toISOString().slice(0, 10);
  const cacheKey = `feed:works:${includeRetracted ? "ret" : "noret"}:${limit}:${query}:${dateBucket}`;

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

  const url = buildOpenAlexWorksUrl({ apiKey, query, limit, includeRetracted, fromYear: args.fromYear });
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

function worksToPapers(works: OpenAlexWork[], limit: number): ExplorePaperInput[] {
  const mapped = works
    .map(openAlexWorkToExplorePaper)
    .filter((p): p is ExplorePaperInput => p !== null);
  return dedupeExplorePapers(mapped, limit);
}

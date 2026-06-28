/**
 * Enrichment paper dari OpenAlex single-work (`GET /works/{id}`) untuk reader detail (P-explore).
 * Memanfaatkan `openalexId` yang sudah tersimpan di cache `explore_papers` (≈100% terisi) untuk
 * menarik metadata kaya yang TIDAK ada di cache: tren sitasi, afiliasi penulis, referensi &
 * "dikutip oleh" ber-judul, concepts/SDG berbobot, funding, OA status.
 *
 * Best-effort: tiap kegagalan jaringan/parse → degrade (skip bagian itu), reader tetap render base.
 * Redis-cached per openalex id (status "ready") supaya buka-ulang detail gratis. Leaf module:
 * hanya bergantung http + external-cache + identifiers (tanpa DB/Elysia).
 */
import { getCache, putCache } from "../papers/external-cache";
import { fetchWithTimeout } from "../papers/http";
import { normalizeDoi } from "../papers/identifiers";
import { collapse, uniqueCompact } from "../lib/text";
import type {
  PaperEnrichment,
  PaperEnrichmentRef,
  PaperWeighted,
  PaperYearCount,
} from "./model";

const OPENALEX_WORKS = "https://api.openalex.org/works";
// Enrichment memblok response detail saat cold (belum di-cache) → timeout pendek supaya
// OpenAlex lambat tak menggantung reader; gagal → degrade ke base paper.
const ENRICH_TIMEOUT_MS = 6_000;
const REF_SAMPLE_CAP = 8;
const CITED_BY_CAP = 6;
const AUTHOR_CAP = 12;
const WORK_SELECT = [
  "id",
  "doi",
  "display_name",
  "type",
  "language",
  "publication_year",
  "cited_by_count",
  "fwci",
  "citation_normalized_percentile",
  "counts_by_year",
  "open_access",
  "primary_location",
  "best_oa_location",
  "authorships",
  "topics",
  "concepts",
  "sustainable_development_goals",
  "grants",
  "referenced_works",
  "related_works",
  "cited_by_api_url",
].join(",");
const NEIGHBOR_SELECT = "id,display_name,publication_year,doi,cited_by_count";

type RawAuthorship = {
  author?: { display_name?: string | null } | null;
  raw_author_name?: string | null;
  countries?: string[] | null;
  institutions?: Array<{ display_name?: string | null; country_code?: string | null }> | null;
};
type RawWeighted = { display_name?: string | null; score?: number | null };
type RawWork = {
  id?: string | null;
  doi?: string | null;
  display_name?: string | null;
  title?: string | null;
  type?: string | null;
  language?: string | null;
  publication_year?: number | null;
  cited_by_count?: number | null;
  fwci?: number | null;
  citation_normalized_percentile?: { value?: number | null } | null;
  counts_by_year?: Array<{ year?: number | null; cited_by_count?: number | null }> | null;
  open_access?: { oa_status?: string | null; oa_url?: string | null } | null;
  primary_location?: {
    license?: string | null;
    source?: { display_name?: string | null; issn?: string[] | null } | null;
  } | null;
  best_oa_location?: { license?: string | null } | null;
  authorships?: RawAuthorship[] | null;
  topics?: RawWeighted[] | null;
  concepts?: RawWeighted[] | null;
  sustainable_development_goals?: RawWeighted[] | null;
  grants?: Array<{ funder_display_name?: string | null }> | null;
  referenced_works?: string[] | null;
  related_works?: string[] | null;
  cited_by_api_url?: string | null;
};

/** `https://openalex.org/W123` | `W123` → `W123`. Null bila bukan id OpenAlex valid. */
function shortOpenAlexId(id: string | null | undefined): string | null {
  if (!id) return null;
  const match = id.match(/W\d+/i);
  return match ? match[0].toUpperCase() : null;
}

function withKey(url: URL): URL {
  const apiKey = process.env.OPENALEX_API_KEY;
  if (apiKey) url.searchParams.set("api_key", apiKey);
  return url;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const response = await fetchWithTimeout(url, {
    timeoutMs: ENRICH_TIMEOUT_MS,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return null;
  return (await response.json()) as T;
}

/** Resolve judul untuk daftar openalex id (referensi) dalam satu call OR-filter. */
async function fetchNeighborsByIds(ids: string[]): Promise<PaperEnrichmentRef[]> {
  const shortIds = uniqueCompact(ids.map(shortOpenAlexId)).slice(0, REF_SAMPLE_CAP);
  if (shortIds.length === 0) return [];
  const url = withKey(new URL(OPENALEX_WORKS));
  url.searchParams.set("filter", `openalex_id:${shortIds.join("|")}`);
  url.searchParams.set("select", NEIGHBOR_SELECT);
  url.searchParams.set("per-page", String(REF_SAMPLE_CAP));
  const json = await fetchJson<{ results?: RawWork[] }>(url.toString());
  return (json?.results ?? [])
    .map(toRef)
    .filter((r): r is PaperEnrichmentRef => r !== null)
    .sort((a, b) => (b.citedByCount ?? 0) - (a.citedByCount ?? 0));
}

/** Sampel "dikutip oleh" (top cited_by_count) via cited_by_api_url. */
async function fetchCitedBy(citedByApiUrl: string | null | undefined): Promise<PaperEnrichmentRef[]> {
  if (!citedByApiUrl) return [];
  let url: URL;
  try {
    url = new URL(citedByApiUrl);
  } catch {
    return [];
  }
  withKey(url);
  url.searchParams.set("select", NEIGHBOR_SELECT);
  url.searchParams.set("per-page", String(CITED_BY_CAP));
  url.searchParams.set("sort", "cited_by_count:desc");
  const json = await fetchJson<{ results?: RawWork[] }>(url.toString());
  return (json?.results ?? [])
    .map(toRef)
    .filter((r): r is PaperEnrichmentRef => r !== null);
}

function toRef(work: RawWork): PaperEnrichmentRef | null {
  const openalexId = shortOpenAlexId(work.id);
  const title = collapse(work.display_name ?? work.title ?? "");
  if (!openalexId || !title) return null;
  const doi = normalizeDoi(work.doi ?? "");
  return {
    openalexId,
    title,
    year: work.publication_year ?? undefined,
    doi: doi || undefined,
    citedByCount: work.cited_by_count ?? undefined,
  };
}

function mapWeighted(list: RawWeighted[] | null | undefined, cap: number): PaperWeighted[] {
  return (list ?? [])
    .map((w) => ({ name: collapse(w.display_name ?? ""), score: w.score ?? undefined }))
    .filter((w) => w.name.length > 0)
    .slice(0, cap);
}

function mapWork(work: RawWork): Omit<PaperEnrichment, "references" | "citedBy"> {
  const authors = (work.authorships ?? []).slice(0, AUTHOR_CAP).map((a) => {
    const institution = collapse(a.institutions?.[0]?.display_name ?? "");
    const country = a.institutions?.[0]?.country_code ?? a.countries?.[0] ?? undefined;
    return {
      name: collapse(a.author?.display_name ?? a.raw_author_name ?? ""),
      institution: institution || undefined,
      country: country || undefined,
    };
  }).filter((a) => a.name.length > 0);

  const institutions = uniqueCompact(
    (work.authorships ?? []).flatMap((a) => (a.institutions ?? []).map((i) => i.display_name)),
  ).slice(0, 10);
  const countries = uniqueCompact(
    (work.authorships ?? []).flatMap((a) => [
      ...(a.institutions ?? []).map((i) => i.country_code),
      ...(a.countries ?? []),
    ]),
  ).slice(0, 12);

  const countsByYear: PaperYearCount[] = (work.counts_by_year ?? [])
    .filter((c) => c.year != null)
    .map((c) => ({ year: c.year as number, citedByCount: c.cited_by_count ?? 0 }))
    .sort((a, b) => a.year - b.year);

  const percentileRaw = work.citation_normalized_percentile?.value;
  const license = work.primary_location?.license ?? work.best_oa_location?.license ?? undefined;

  return {
    oaStatus: work.open_access?.oa_status ?? undefined,
    oaUrl: work.open_access?.oa_url ?? undefined,
    license: license || undefined,
    journal: collapse(work.primary_location?.source?.display_name ?? "") || undefined,
    issn: work.primary_location?.source?.issn ?? undefined,
    type: work.type ?? undefined,
    language: work.language ?? undefined,
    fwci: work.fwci ?? undefined,
    citationPercentile:
      typeof percentileRaw === "number" ? Math.round(percentileRaw * 100) : undefined,
    countsByYear,
    authors,
    institutions,
    countries,
    concepts: mapWeighted(work.topics ?? work.concepts, 6),
    sdgs: mapWeighted(work.sustainable_development_goals, 4),
    funders: uniqueCompact((work.grants ?? []).map((g) => g.funder_display_name)).slice(0, 6),
    referencedCount: work.referenced_works?.length ?? 0,
    citedByCount: work.cited_by_count ?? undefined,
    relatedCount: work.related_works?.length ?? 0,
  };
}

/**
 * Fetch + map enrichment penuh untuk satu paper by openalex id. Redis-cached per short id.
 * `null` bila id invalid / work tak ketemu / OpenAlex error.
 */
export async function fetchPaperEnrichment(
  openalexId: string,
): Promise<PaperEnrichment | null> {
  const shortId = shortOpenAlexId(openalexId);
  if (!shortId) return null;

  const cacheKey = `enrich:${shortId}`;
  const cached = await getCache("openalex", cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached.valueJson) as PaperEnrichment;
    } catch {
      // korup → refetch
    }
  }

  const workUrl = withKey(new URL(`${OPENALEX_WORKS}/${shortId}`));
  workUrl.searchParams.set("select", WORK_SELECT);
  const work = await fetchJson<RawWork>(workUrl.toString());
  if (!work || !work.id) return null;

  const base = mapWork(work);
  // Referensi + dikutip-oleh best-effort & paralel; gagal salah satu tak menggugurkan enrichment.
  const [references, citedBy] = await Promise.all([
    fetchNeighborsByIds(work.referenced_works ?? []).catch(() => []),
    fetchCitedBy(work.cited_by_api_url).catch(() => []),
  ]);

  const enrichment: PaperEnrichment = { ...base, references, citedBy };
  await putCache("openalex", cacheKey, "ready", JSON.stringify(enrichment));
  return enrichment;
}

/**
 * Facets Explore (MURAH, cached, tanpa job) — menggerakkan Pulse chart + Constellation. Pulse =
 * tren volume per-tahun multi-series dari OpenAlex `group_by`, di-seed dari subfield NYATA korpus
 * (`primary_topic.subfield.id`): `q` ada → subfield korpus yg match; `q` kosong → minat user
 * (tiap minat satu pita) atau subfield paling aktif global bila tak ada minat. Constellation =
 * paper relevan-secara-makna (node, dari OpenAlex `search.semantic`) + edge kemiripan
 * (related_works ∪ tumpang-tindih topik — TANPA call ekstra). Soft-fail: tiap sisi di-try/catch
 * → struktur kosong (UI degrade ke empty-state, tak pernah 500).
 */
import {
  fetchOpenAlexGroupBy,
  fetchOpenAlexSemantic,
  fetchOpenAlexWorks,
  fetchOpenAlexYearCounts,
  type OpenAlexGroup,
  type OpenAlexWork,
  openAlexWorkToExplorePaper,
} from "../feed/openAlex";
import { getCache, putCache } from "../papers/external-cache";
import { collapse, normalizeKey } from "../lib/text";

export type FacetPulse = { years: number[]; series: Array<{ name: string; values: number[] }> };
/** Satu paper di Constellation (node). `key` = key kanonik → route /app/explore/[paperRef]. */
export type ConstellationNode = {
  key: string;
  title: string;
  field: string;
  year?: number;
  citedBy?: number;
  score?: number;
};
/** [indexNodeA, indexNodeB, weight 0..1] — edge kemiripan makna antar-paper. */
export type ConstellationEdge = [number, number, number];
export type ConstellationData = { nodes: ConstellationNode[]; edges: ConstellationEdge[] };
export type ExploreFacets = { pulse: FacetPulse; constellation: ConstellationData };

const PULSE_YEARS = 7;
const MAX_NODES = 28;
const MAX_EDGES = 60;
const EDGE_MIN_WEIGHT = 0.12;
const RELATED_WEIGHT = 0.7;
const MAX_SERIES = 4;

const EMPTY_FACETS: ExploreFacets = {
  pulse: { years: [], series: [] },
  constellation: { nodes: [], edges: [] },
};

export const FacetsService = {
  /**
   * `interests` (topik minat user, lowercase) dipakai HANYA saat `q` kosong untuk
   * mempersonalisasi seri Pulse; cache di-kunci per-set minat supaya tetap shareable.
   */
  async getFacets(q: string, interests: string[] = []): Promise<ExploreFacets> {
    const query = q.trim();
    const seedKey = query
      ? normalizeKey(query)
      : interests.length > 0
        ? `int:${interests.map(normalizeKey).filter(Boolean).sort().join("|")}`
        : "trending";
    const cacheKey = `facets:${seedKey}`;
    const cached = await getCache("explore_facets", cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached.valueJson) as ExploreFacets;
      } catch {
        // fall through
      }
    }

    const [pulse, constellation] = await Promise.all([
      buildPulse(query, interests).catch(() => EMPTY_FACETS.pulse),
      buildConstellation(query, interests).catch(() => EMPTY_FACETS.constellation),
    ]);
    const facets: ExploreFacets = { pulse, constellation };
    const nonEmpty = pulse.series.length > 0 || constellation.nodes.length > 0;
    await putCache("explore_facets", cacheKey, nonEmpty ? "ready" : "empty", JSON.stringify(facets));
    return facets;
  },
};

function currentYear(): number {
  return new Date().getUTCFullYear();
}

function yearRange(): number[] {
  const end = currentYear();
  return Array.from({ length: PULSE_YEARS }, (_, i) => end - (PULSE_YEARS - 1) + i);
}

/** Map agregat year→count ke nilai per-tahun (0-fill) selaras `years`. */
function seriesFromYearCounts(counts: OpenAlexGroup[], years: number[]): number[] {
  const byYear = new Map<number, number>();
  for (const g of counts) {
    const y = Number.parseInt(g.key, 10);
    if (Number.isFinite(y)) byYear.set(y, g.count);
  }
  return years.map((y) => byYear.get(y) ?? 0);
}

/** Satu lapisan stream: label + cara memfilter korpusnya (search teks dan/atau filter subfield). */
type PulseSeed = { name: string; search?: string; filter?: string };

/** "https://openalex.org/subfields/3312" → "3312" (id pendek untuk klausa filter OpenAlex). */
export function subfieldId(key: string): string {
  return key.split("/").pop() ?? key;
}

/** Title-case label minat ("machine learning" → "Machine Learning") agar selaras label subfield. */
function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Top-N subfield (group_by sudah desc by count) → seed pita, opsional dibatasi `search`. */
export function topSubfieldSeeds(groups: OpenAlexGroup[], search?: string): PulseSeed[] {
  return groups
    .filter((g) => g.count > 0)
    .slice(0, MAX_SERIES)
    .map((g) => ({ name: g.label, search, filter: `primary_topic.subfield.id:${subfieldId(g.key)}` }));
}

/**
 * Pilih hingga MAX_SERIES seri Pulse, urut prioritas:
 *  1. ada `query` → subfield nyata dari korpus yang match (subtopik faktual, bukan LLM).
 *  2. kosong + ada minat → tiap minat = satu pita (personal).
 *  3. kosong tanpa minat → subfield paling aktif belakangan (global).
 */
async function pickPulseSeeds(
  query: string,
  interests: string[],
  recentFrom: number,
): Promise<PulseSeed[]> {
  if (query) {
    const groups = await fetchOpenAlexGroupBy({
      query,
      groupBy: "primary_topic.subfield.id",
      fromYear: recentFrom,
    }).catch(() => []);
    return topSubfieldSeeds(groups, query);
  }

  const picks = interests.map((t) => t.trim()).filter(Boolean).slice(0, MAX_SERIES);
  if (picks.length >= 2) {
    return picks.map((t) => ({ name: titleCase(t), search: t }));
  }

  const groups = await fetchOpenAlexGroupBy({
    query: "",
    groupBy: "primary_topic.subfield.id",
    fromYear: recentFrom,
  }).catch(() => []);
  return topSubfieldSeeds(groups);
}

async function buildPulse(query: string, interests: string[]): Promise<FacetPulse> {
  const years = yearRange();
  const fromYear = years[0];
  const recentFrom = currentYear() - 2;

  const seeds = await pickPulseSeeds(query, interests, recentFrom);

  const single = async (): Promise<FacetPulse> => {
    const counts = await fetchOpenAlexYearCounts({ query, fromYear }).catch(() => []);
    return { years, series: [{ name: query || "Semua riset", values: seriesFromYearCounts(counts, years) }] };
  };
  if (seeds.length < 2) return single();

  const series = await Promise.all(
    seeds.map(async (s) => {
      const counts = await fetchOpenAlexGroupBy({
        query: s.search ?? "",
        groupBy: "publication_year",
        filter: s.filter,
        fromYear,
      }).catch(() => []);
      return { name: s.name, values: seriesFromYearCounts(counts, years) };
    }),
  );

  // Jaga-jaga: semua seri nol (mis. korpus terlalu sempit) → degrade ke satu tren total.
  if (series.every((s) => s.values.every((v) => v === 0))) return single();
  return { years, series };
}

/** ID OpenAlex sebuah work ("https://openalex.org/W…") untuk mencocokkan related_works. */
function workOpenAlexId(work: OpenAlexWork): string {
  return work.ids?.openalex ?? work.id ?? "";
}

/** Jaccard dua set topik (irisan / gabungan) → kekuatan kemiripan tematik 0..1. */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Fitur node untuk perhitungan edge (di-export untuk unit test). */
export type NodeFeat = { oaId: string; topics: Set<string>; related: Set<string> };

/**
 * Edge constellation = kemiripan MAKNA antar-paper, dihitung dari objek yang sudah di-fetch
 * (nol call ekstra): related_works OpenAlex (algoritmik) → edge "kuat"; tumpang-tindih topik
 * (Jaccard) → bobot tematik. Tiap node dijamin ≥1 edge terkuat (anti-orphan), lalu diisi
 * global desc s/d MAX_EDGES.
 */
export function buildEdges(feats: NodeFeat[]): ConstellationEdge[] {
  const n = feats.length;
  const candidates: ConstellationEdge[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = feats[i]!;
      const b = feats[j]!;
      const related =
        (a.oaId !== "" && b.related.has(a.oaId)) || (b.oaId !== "" && a.related.has(b.oaId));
      let weight = jaccard(a.topics, b.topics);
      if (related) weight = Math.max(weight, RELATED_WEIGHT);
      if (weight < EDGE_MIN_WEIGHT) continue;
      candidates.push([i, j, Math.round(weight * 1000) / 1000]);
    }
  }
  candidates.sort((x, y) => y[2] - x[2]);

  const selected = new Map<string, ConstellationEdge>();
  const keyOf = (e: ConstellationEdge) => `${e[0]}:${e[1]}`;
  // Edge terkuat per node → graf tak terputus (k-NN, k=1).
  const bestForNode: Array<ConstellationEdge | undefined> = new Array(n);
  for (const e of candidates) {
    bestForNode[e[0]] ??= e;
    bestForNode[e[1]] ??= e;
  }
  for (const e of bestForNode) if (e) selected.set(keyOf(e), e);
  for (const e of candidates) {
    if (selected.size >= MAX_EDGES) break;
    selected.set(keyOf(e), e);
  }
  return [...selected.values()];
}

/**
 * Constellation = paper relevan-secara-makna (node) + edge kemiripan. Node dari OpenAlex
 * `search.semantic` (seed = `q`, atau frasa minat user saat `q` kosong); tanpa seed → trending.
 * Warna node = `primary_topic.field`; ukuran ∝ sitasi. Dedup per key kanonik.
 */
async function buildConstellation(query: string, interests: string[]): Promise<ConstellationData> {
  const seed = query.trim() || interests.map((t) => t.trim()).filter(Boolean).join(", ");
  // Utama: semantic (paling "makna"). Degradasi: pencarian keyword (tetap ada node, edge dari
  // tumpang-tindih topik saja). Terakhir: trending — supaya constellation tak pernah kosong
  // hanya karena semantic gagal/transient.
  let works: OpenAlexWork[] = [];
  if (seed) {
    works = await fetchOpenAlexSemantic({ query: seed, limit: MAX_NODES })
      .then((r) => r.works)
      .catch(() => []);
    if (works.length === 0) works = (await fetchOpenAlexWorks({ query: seed, limit: MAX_NODES })).works;
  }
  if (works.length === 0) works = (await fetchOpenAlexWorks({ query: "", limit: MAX_NODES })).works;

  const nodes: ConstellationNode[] = [];
  const feats: NodeFeat[] = [];
  const seenKey = new Set<string>();
  for (const work of works) {
    if (nodes.length >= MAX_NODES) break;
    const paper = openAlexWorkToExplorePaper(work);
    if (!paper || seenKey.has(paper.key)) continue;
    seenKey.add(paper.key);
    nodes.push({
      key: paper.key,
      title: paper.title,
      field: collapse(work.primary_topic?.field?.display_name ?? "") || "Lainnya",
      year: paper.year,
      citedBy: paper.citedByCount,
      score: paper.score,
    });
    feats.push({
      oaId: workOpenAlexId(work),
      topics: new Set(paper.topics.map((t) => t.toLowerCase())),
      related: new Set(work.related_works ?? []),
    });
  }

  return { nodes, edges: buildEdges(feats) };
}

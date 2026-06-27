/**
 * Facets Explore (MURAH, cached, tanpa job) — menggerakkan Pulse chart + Globe dari OpenAlex
 * `group_by`. Pulse = tren volume per-tahun multi-series, di-seed dari subfield NYATA korpus
 * (`primary_topic.subfield.id`): `q` ada → subfield korpus yg match; `q` kosong → minat user
 * (tiap minat satu pita) atau subfield paling aktif global bila tak ada minat. Globe = sebaran
 * riset per-negara (nodes) + kolaborasi internasional (arcs, ko-okurensi country_code dlm
 * korpus yg sudah di-fetch — TANPA call ekstra). Soft-fail: tiap sisi di-try/catch → struktur
 * kosong (UI degrade ke empty-state, tak pernah 500).
 */
import {
  fetchOpenAlexCountryCounts,
  fetchOpenAlexGroupBy,
  fetchOpenAlexWorks,
  fetchOpenAlexYearCounts,
  type OpenAlexGroup,
  type OpenAlexWork,
} from "../feed/openAlex";
import { getCache, putCache } from "../papers/external-cache";
import { normalizeKey } from "../lib/text";
import { centroidFor } from "./country-centroids";

export type FacetPulse = { years: number[]; series: Array<{ name: string; values: number[] }> };
export type FacetGlobeNode = {
  lat: number;
  lon: number;
  label: string;
  count: number;
  country: string;
  emerging: boolean;
};
/** [indexNodeA, indexNodeB, weight] — busur kolaborasi antar-negara. */
export type FacetGlobeArc = [number, number, number];
export type FacetGlobe = { nodes: FacetGlobeNode[]; arcs: FacetGlobeArc[] };
export type ExploreFacets = { pulse: FacetPulse; globe: FacetGlobe };

const PULSE_YEARS = 7;
const MAX_NODES = 30;
const MAX_ARCS = 14;
const MAX_SERIES = 4;

const EMPTY_FACETS: ExploreFacets = {
  pulse: { years: [], series: [] },
  globe: { nodes: [], arcs: [] },
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

    const [pulse, globe] = await Promise.all([
      buildPulse(query, interests).catch(() => EMPTY_FACETS.pulse),
      buildGlobe(query).catch(() => EMPTY_FACETS.globe),
    ]);
    const facets: ExploreFacets = { pulse, globe };
    const nonEmpty = pulse.series.length > 0 || globe.nodes.length > 0;
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

/** Negara (uppercase ISO-2) yang muncul di authorships sebuah work. */
function workCountryCodes(work: OpenAlexWork): string[] {
  const codes = new Set<string>();
  for (const a of work.authorships ?? []) {
    for (const c of a.countries ?? []) if (c) codes.add(c.toUpperCase());
    for (const inst of a.institutions ?? []) {
      if (inst.country_code) codes.add(inst.country_code.toUpperCase());
    }
  }
  return [...codes];
}

async function buildGlobe(query: string): Promise<FacetGlobe> {
  const recentFrom = currentYear() - 2;
  const [allCounts, recentCounts, fetched] = await Promise.all([
    fetchOpenAlexCountryCounts({ query }),
    fetchOpenAlexCountryCounts({ query, fromYear: recentFrom }),
    fetchOpenAlexWorks({ query, limit: 24 }),
  ]);

  const totalAll = allCounts.reduce((s, g) => s + g.count, 0);
  const totalRecent = recentCounts.reduce((s, g) => s + g.count, 0) || 1;
  const recentByCode = new Map(recentCounts.map((g) => [g.key.toUpperCase(), g.count]));

  // OpenAlex group_by sudah desc by count → top-N negara yang punya centroid.
  const nodes: FacetGlobeNode[] = [];
  const codeToIndex = new Map<string, number>();
  for (const g of allCounts) {
    if (nodes.length >= MAX_NODES) break;
    if (g.count <= 0) continue;
    const code = g.key.toUpperCase();
    const centroid = centroidFor(code);
    if (!centroid) continue;
    const allShare = totalAll ? g.count / totalAll : 0;
    const recentShare = (recentByCode.get(code) ?? 0) / totalRecent;
    const emerging = recentShare > allShare * 1.2 && recentShare > 0.01;
    codeToIndex.set(code, nodes.length);
    nodes.push({
      lat: centroid.lat,
      lon: centroid.lon,
      label: centroid.name,
      count: g.count,
      country: code,
      emerging,
    });
  }

  // Arcs = ko-okurensi negara pada satu work (kolaborasi). Tanpa call ekstra.
  const edge = new Map<string, number>();
  for (const work of fetched.works) {
    const idxs = [
      ...new Set(
        workCountryCodes(work)
          .map((c) => codeToIndex.get(c))
          .filter((i): i is number => i !== undefined),
      ),
    ].sort((a, b) => a - b);
    for (let a = 0; a < idxs.length; a++) {
      for (let b = a + 1; b < idxs.length; b++) {
        const key = `${idxs[a]}:${idxs[b]}`;
        edge.set(key, (edge.get(key) ?? 0) + 1);
      }
    }
  }
  const arcs: FacetGlobeArc[] = [...edge.entries()]
    .map(([key, weight]): FacetGlobeArc => {
      const [i, j] = key.split(":").map(Number);
      return [i!, j!, weight];
    })
    .sort((a, b) => b[2] - a[2])
    .slice(0, MAX_ARCS);

  return { nodes, arcs };
}

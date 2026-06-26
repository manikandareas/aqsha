"use client";

// Hooks data Explore (driven by query `q`). Tiga lapis sesuai biaya:
//  - useExploreSuggest  → typeahead saran kueri (LLM murah, cached).
//  - useExploreFacets   → Pulse chart + Globe (OpenAlex group_by, cepat, cached).
//  - useExploreAnalysis → Gap + Tension (background job; polling saat status "pending").

import { useQuery } from "@tanstack/react-query";
import { useApi } from "@/lib/api-client";
import { unwrap } from "@/lib/api-query";
import type { GapResult, GlobeArc, GlobeNode, PulseData, TensionData } from "./types";

// Bentuk respons /explore/* — tipe leaf (globe/pulse/gap/tension) di-reuse dari ./types
// (sumber tunggal, dipakai komponen) supaya tak ada keluarga tipe paralel yang drift.
export type ExploreFacetsData = {
  pulse: PulseData;
  globe: { nodes: GlobeNode[]; arcs: GlobeArc[] };
};
export type ExploreAnalysisData = {
  status: "idle" | "pending" | "ready" | "error";
  gap: GapResult[];
  tension: TensionData | null;
};

/** Saran kueri typeahead. Enabled hanya saat term ≥ 2 char (server juga gate). */
export function useExploreSuggest(term: string) {
  const api = useApi();
  const q = term.trim();
  return useQuery({
    queryKey: ["explore", "suggest", q],
    enabled: q.length >= 2,
    staleTime: 5 * 60_000,
    queryFn: async () =>
      (unwrap(await api.explore.suggest.get({ query: { q } })) as { suggestions: string[] })
        .suggestions,
  });
}

/** Pulse + Globe untuk `q` (kosong → korpus trending). Cached server-side. */
export function useExploreFacets(q: string) {
  const api = useApi();
  const t = q.trim();
  return useQuery({
    queryKey: ["explore", "facets", t],
    staleTime: 10 * 60_000,
    queryFn: async () =>
      unwrap(await api.explore.facets.get({ query: { q: t } })) as ExploreFacetsData,
  });
}

/** Gap + Tension untuk `q`. Polling tiap 2.5s selama status "pending" (job belum selesai). */
export function useExploreAnalysis(q: string) {
  const api = useApi();
  const t = q.trim();
  return useQuery({
    queryKey: ["explore", "analysis", t],
    enabled: t.length >= 2,
    refetchInterval: (query) =>
      (query.state.data as ExploreAnalysisData | undefined)?.status === "pending" ? 2500 : false,
    queryFn: async () =>
      unwrap(await api.explore.analysis.get({ query: { q: t } })) as ExploreAnalysisData,
  });
}

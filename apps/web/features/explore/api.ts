"use client";

// Hooks data Explore (driven by query `q`).
//  - useExploreSuggest → typeahead saran kueri (LLM murah, cached) untuk ask-bar.
// Pencarian paper + berita sendiri memakai feed discovery (features/discovery/api).

import { useQuery } from "@tanstack/react-query";
import { useApi } from "@/lib/api-client";
import { unwrap } from "@/lib/api-query";

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

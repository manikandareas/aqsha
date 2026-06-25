// Right-rail aggregate derived entirely from the items already loaded (the
// stable /feed/home pool). Returns an empty result when there are no cited
// papers, so the matching aside module hides itself.

import type { DiscoveryItem } from "./model";

// ── Most-cited papers ─────────────────────────────────────────────────────
export type TopCitedPaper = { item: DiscoveryItem; count: number };

export function deriveTopCited(items: DiscoveryItem[], limit = 4): TopCitedPaper[] {
  return items
    .flatMap((item) =>
      item.kind === "paper" && typeof item.citedByCount === "number" && item.citedByCount > 0
        ? [{ item, count: item.citedByCount }]
        : [],
    )
    .toSorted((a, b) => b.count - a.count || a.item.title.localeCompare(b.item.title))
    .slice(0, limit);
}

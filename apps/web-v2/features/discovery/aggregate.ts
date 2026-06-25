// Right-rail aggregates derived entirely from the items already loaded (the
// stable /feed/home pool). Each derive returns an empty/zero result for views
// that lack the data, so the matching aside module hides itself.

import type { DiscoveryItem } from "./model";
import type { FeedVerdict } from "./types";

export type TopTopic = { name: string; count: number };

export function deriveTopTopics(items: DiscoveryItem[], limit = 8): TopTopic[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const topics = item.topics.length > 0 ? item.topics : [item.venue, item.provider];
    for (const topic of topics) {
      const name = topic?.trim();
      if (!name) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

// ── Verdict distribution (fact-balance donut) ─────────────────────────────
export type VerdictSegment = { verdict: FeedVerdict; count: number };
export type VerdictBreakdown = { total: number; segments: VerdictSegment[] };

const VERDICT_ORDER: FeedVerdict[] = [
  "supported",
  "partially_supported",
  "needs_context",
  "unverified",
  "contradicted",
];

export function deriveVerdictBreakdown(items: DiscoveryItem[]): VerdictBreakdown {
  const counts = new Map<FeedVerdict, number>();
  for (const item of items) {
    if (item.kind !== "claim" || !item.claim) continue;
    counts.set(item.claim.verdict, (counts.get(item.claim.verdict) ?? 0) + 1);
  }
  const segments = Array.from(counts.entries())
    .map(([verdict, count]) => ({ verdict, count }))
    .toSorted((a, b) => b.count - a.count || VERDICT_ORDER.indexOf(a.verdict) - VERDICT_ORDER.indexOf(b.verdict));
  const total = segments.reduce((sum, s) => sum + s.count, 0);
  return { total, segments };
}

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

// ── Topic momentum (sparkline movers) ─────────────────────────────────────
export type TopicMomentum = { item: DiscoveryItem; values: number[]; changePct: number };

export function deriveTopicMomentum(items: DiscoveryItem[], limit = 4): TopicMomentum[] {
  return items
    .flatMap((item) => {
      if (!(item.kind === "topic" && Array.isArray(item.sparkline) && item.sparkline.length > 1)) {
        return [];
      }
      const values = item.sparkline;
      const first = values[0];
      const last = values[values.length - 1];
      const base = Math.abs(first) > 0 ? Math.abs(first) : 1;
      return [{ item, values, changePct: ((last - first) / base) * 100 }];
    })
    .toSorted((a, b) => (b.item.trendScore ?? 0) - (a.item.trendScore ?? 0) || Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, limit);
}

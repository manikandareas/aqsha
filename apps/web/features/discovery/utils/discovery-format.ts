// Shared formatting + aggregation utilities for the unified discovery surface
// (Brief / Papers / Cek fakta). Extracted from the former Explore + Feed pages
// so both paper rows and feed items share one implementation.

import type { DiscoveryItem, FeedVerdict } from "@aqsha/convex/feed";

export type TopTopic = { name: string; count: number };

type TopicSource = {
  topics: string[];
  venue?: string;
  provider?: string;
};

/**
 * Rank the most frequent topics across a set of discovery items. Items without
 * explicit topics fall back to their venue/provider so the rail still has
 * signal (mirrors the original Explore behaviour). One canonical impl replaces
 * the two divergent `deriveTopTopics` copies in explore-page + feed-page.
 */
export function deriveTopTopics(items: TopicSource[], limit = 12): TopTopic[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const topics =
      item.topics.length > 0 ? item.topics : [item.venue, item.provider];
    for (const topic of topics) {
      const name = topic?.trim();
      if (!name) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .toSorted((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

const paperDateFormatter = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatPaperDate(paper: {
  publicationDate?: string;
  year?: number;
}): string {
  if (paper.publicationDate) {
    const date = new Date(paper.publicationDate);
    if (!Number.isNaN(date.getTime())) {
      return paperDateFormatter.format(date);
    }
  }

  return paper.year ? String(paper.year) : "";
}

export function formatCitationCount(value: number | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const count =
    value >= 1_000
      ? `${(value / 1_000).toLocaleString("en", { maximumFractionDigits: 1 })}k`
      : value.toLocaleString("en");
  return `${count} citations`;
}

export function topicBadgeClass(topic: string): string {
  const normalized = topic.toLowerCase();
  if (normalized.includes("agent") || normalized.includes("reason")) {
    return "bg-lavender-soft text-lavender-foreground";
  }
  if (normalized.includes("world") || normalized.includes("robot")) {
    return "bg-coral-soft text-coral-foreground";
  }
  if (
    normalized.includes("image") ||
    normalized.includes("video") ||
    normalized.includes("3d")
  ) {
    return "bg-sky-soft text-sky-foreground";
  }
  return "bg-lemon-soft text-lemon-foreground";
}

// ── Verdict distribution (fact-balance donut) ─────────────────────────────
export type VerdictSegment = { verdict: FeedVerdict; count: number };
export type VerdictBreakdown = { total: number; segments: VerdictSegment[] };

// Stable taxonomy order — doubles as the tiebreak when two verdicts share a
// count, so the donut/legend ordering never flickers across reactive refreshes.
const VERDICT_ORDER: FeedVerdict[] = [
  "supported",
  "partially_supported",
  "needs_context",
  "unverified",
  "contradicted",
];

/**
 * Tally fact-check verdicts across the discovery items. Only `claim` items with
 * a resolved `claim.verdict` count. Returns `total === 0` for verdict-less views
 * (e.g. Papers) so the rail module can hide itself.
 */
export function deriveVerdictBreakdown(
  items: DiscoveryItem[],
): VerdictBreakdown {
  const counts = new Map<FeedVerdict, number>();
  for (const item of items) {
    if (item.kind !== "claim" || !item.claim) continue;
    counts.set(item.claim.verdict, (counts.get(item.claim.verdict) ?? 0) + 1);
  }
  const segments = Array.from(counts.entries())
    .map(([verdict, count]) => ({ verdict, count }))
    .toSorted(
      (left, right) =>
        right.count - left.count ||
        VERDICT_ORDER.indexOf(left.verdict) - VERDICT_ORDER.indexOf(right.verdict),
    );
  const total = segments.reduce((sum, segment) => sum + segment.count, 0);
  return { total, segments };
}

// ── Most-cited papers (ranked bars) ───────────────────────────────────────
export type TopCitedPaper = { item: DiscoveryItem; count: number };

/**
 * Rank the most-cited papers in the current item set. Non-papers and papers
 * without a positive `citedByCount` are excluded; an empty result hides the
 * module. Ties break on title so the order is deterministic.
 */
export function deriveTopCited(
  items: DiscoveryItem[],
  limit = 4,
): TopCitedPaper[] {
  return items
    .flatMap((item) =>
      item.kind === "paper" && typeof item.citedByCount === "number" && item.citedByCount > 0
        ? [{ item, count: item.citedByCount as number }]
        : [],
    )
    .toSorted(
      (left, right) =>
        right.count - left.count ||
        left.item.title.localeCompare(right.item.title),
    )
    .slice(0, limit);
}

// ── Topic momentum (sparkline movers) ─────────────────────────────────────
export type TopicMomentum = {
  item: DiscoveryItem;
  values: number[];
  changePct: number;
};

/**
 * Rank the trending `topic` items that carry a usable sparkline (the GDELT
 * "topik naik daun" series). `changePct` is first→last delta over the window,
 * used as the up/down signal; ordering follows the backend `trendScore` with the
 * delta magnitude as the tiebreak. Empty result hides the module.
 */
export function deriveTopicMomentum(
  items: DiscoveryItem[],
  limit = 4,
): TopicMomentum[] {
  return items
    .flatMap((item) => {
      if (!(item.kind === "topic" && Array.isArray(item.sparkline) && item.sparkline.length > 1)) {
        return [];
      }
      const values = item.sparkline as number[];
      const first = values[0];
      const last = values[values.length - 1];
      const base = Math.abs(first) > 0 ? Math.abs(first) : 1;
      return [{ item, values, changePct: ((last - first) / base) * 100 }];
    })
    .toSorted(
      (left, right) =>
        right.item.trendScore - left.item.trendScore ||
        Math.abs(right.changePct) - Math.abs(left.changePct),
    )
    .slice(0, limit);
}

// Shared formatting + aggregation utilities for the unified discovery surface
// (Brief / Papers / Cek fakta). Extracted from the former Explore + Feed pages
// so both paper rows and feed items share one implementation.

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

export function formatPaperDate(paper: {
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

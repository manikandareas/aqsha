import type { ChangelogEntry } from "@/lib/content-types";
import { formatDateId } from "@/lib/dates";

/**
 * Compact “rilis terbaru” teaser — fully serializable for Astro.
 * `dateLabel` is always set when this object exists (formatted on the server).
 */
export type TeaserLatest = {
  href: string;
  title: string;
  publishedAt: string;
  dateLabel: string;
  summary?: string;
};

export type LandingLatest = {
  teaserLatest: TeaserLatest | null;
};

/** Map one changelog entry into the landing's below-the-fold teaser. */
export function mapLandingLatest(
  entry: ChangelogEntry | null,
): LandingLatest {
  if (!entry) {
    return { teaserLatest: null };
  }

  const summary = entry.excerpt?.trim();

  return {
    teaserLatest: {
      href: entry.url,
      title: entry.title,
      publishedAt: entry.publishedAt,
      dateLabel: formatDateId(entry.publishedAt),
      ...(summary ? { summary } : {}),
    },
  };
}

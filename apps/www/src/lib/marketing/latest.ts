import { CATEGORY_META } from "@/lib/changelog/categories";
import type { ChangelogEntry } from "@/lib/content-types";

/** Hero announcement pill (serializable — no MDX). */
export type LatestUpdate = {
  title: string;
  href: string;
  tag: string;
};

/** Compact “rilis terbaru” teaser before bottom CTA. */
export type TeaserLatest = {
  href: string;
  title: string;
  publishedAt: string;
  summary?: string;
};

export type LandingLatest = {
  latestUpdate: LatestUpdate | null;
  teaserLatest: TeaserLatest | null;
};

/** Map one changelog entry into both landing surfaces. */
export function mapLandingLatest(
  entry: ChangelogEntry | null,
): LandingLatest {
  if (!entry) {
    return { latestUpdate: null, teaserLatest: null };
  }

  return {
    latestUpdate: {
      title: entry.heroTitle ?? entry.title,
      href: entry.url,
      tag:
        entry.heroTag ??
        (entry.categories[0]
          ? CATEGORY_META[entry.categories[0]].label
          : "Update"),
    },
    teaserLatest: {
      href: entry.url,
      title: entry.title,
      publishedAt: entry.publishedAt,
      summary: entry.excerpt,
    },
  };
}

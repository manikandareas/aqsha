// Discovery nav constants (modes, topic categories, year-range filter). Reuses
// the feed topic taxonomy from ./types so the nav and the `/feed` topic filter
// agree. Kept as plain useState in the page (no URL state — deep-link not needed).

import { FEED_TOPIC_LABELS, type FeedTopic } from "./types";

export const DISCOVERY_MODE_LABELS = { foryou: "Untukmu", top: "Teratas", topics: "Topik" } as const;

export const DISCOVERY_TOPICS = Object.keys(FEED_TOPIC_LABELS) as FeedTopic[];
export const DISCOVERY_TOPIC_LABELS = FEED_TOPIC_LABELS;

export const DISCOVERY_RANGES = ["all", "year", "threeYears", "fiveYears"] as const;
export type DiscoveryRange = (typeof DISCOVERY_RANGES)[number];

export const DISCOVERY_RANGE_LABELS: Record<DiscoveryRange, string> = {
  all: "Semua",
  year: "Tahun ini",
  threeYears: "3 tahun terakhir",
  fiveYears: "5 tahun terakhir",
};

// Map a coarse range token to a publication-year floor for the search backend.
export function rangeToFromYear(range: DiscoveryRange): number | undefined {
  if (range === "all") return undefined;
  const year = new Date().getUTCFullYear();
  if (range === "year") return year;
  if (range === "threeYears") return year - 2;
  return year - 4;
}

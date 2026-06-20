"use client";

import {
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from "nuqs";
import {
  DISCOVERY_TOPIC_CATEGORIES,
  DISCOVERY_TOPIC_CATEGORY_LABELS,
  type DiscoveryTopicCategory,
} from "@aqsha/convex/feed";

// One unified discovery surface. The mode + filters live in the URL so they are
// deep-linkable and back-button friendly (same nuqs idiom as the workspace
// library). `foryou` is the default → the personalized feed shows first.
//
// Back-compat: the old `?view=brief|papers` param is simply ignored (no parser),
// so `mode` defaults to `foryou`; an old `?view=papers&q=…` deep link still lands
// in search via the preserved `q` param.
export const discoveryModes = ["foryou", "top", "topics"] as const;
export type DiscoveryMode = (typeof discoveryModes)[number];

export const discoveryModeLabels: Record<DiscoveryMode, string> = {
  foryou: "For You",
  top: "Top",
  topics: "Topics",
};

// Topic categories for the Topics popover — sourced from the backend taxonomy
// (@aqsha/convex/feed) so the nav and the getFeedPaginated `topic` filter agree.
export const discoveryTopicCategories = DISCOVERY_TOPIC_CATEGORIES;
export const discoveryTopicCategoryLabels = DISCOVERY_TOPIC_CATEGORY_LABELS;
export type { DiscoveryTopicCategory };

export const discoveryRanges = ["all", "year", "threeYears", "fiveYears"] as const;
export type DiscoveryRange = (typeof discoveryRanges)[number];

// Feed copy is Indonesian-first; cards prefer the `id` title/tldr variants when
// present. Kept as a constant (not a user toggle) so the surface stays in one
// language.
export const DISCOVERY_LANG = "id" as const;

const discoveryParsers = {
  mode: parseAsStringLiteral(discoveryModes).withDefault("foryou"),
  // Nullable: only set while in Topics mode with a category chosen.
  topic: parseAsStringLiteral(DISCOVERY_TOPIC_CATEGORIES),
  q: parseAsString.withDefault(""),
  range: parseAsStringLiteral(discoveryRanges).withDefault("all"),
};

export function useDiscoveryNav() {
  return useQueryStates(discoveryParsers, { history: "replace" });
}

// Map a coarse range token to a publication-year floor for the search backend
// (server-side filter → narrowing refetches instead of emptying a client list).
export function rangeToFromYear(
  range: DiscoveryRange,
  now: number = Date.now(),
): number | undefined {
  if (range === "all") return undefined;
  const year = new Date(now).getUTCFullYear();
  if (range === "year") return year;
  if (range === "threeYears") return year - 2;
  return year - 4;
}

export const discoveryRangeLabels: Record<DiscoveryRange, string> = {
  all: "Semua",
  year: "Tahun ini",
  threeYears: "3 tahun terakhir",
  fiveYears: "5 tahun terakhir",
};

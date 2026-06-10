"use client";

import {
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from "nuqs";

// One unified discovery surface. The view + filters live in the URL so they
// are deep-linkable and back-button friendly (same nuqs idiom as the workspace
// library). `brief` is the default → the feed shows first on entry.
export const discoveryViews = ["brief", "papers"] as const;
export type DiscoveryView = (typeof discoveryViews)[number];

export const discoveryRanges = ["all", "year", "threeYears", "fiveYears"] as const;
export type DiscoveryRange = (typeof discoveryRanges)[number];

// Feed copy is Indonesian-first; cards prefer the `id` title/tldr variants when
// present. Kept as a constant (not a user toggle) so the surface stays in one
// language.
export const DISCOVERY_LANG = "id" as const;

const discoveryParsers = {
  view: parseAsStringLiteral(discoveryViews).withDefault("brief"),
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

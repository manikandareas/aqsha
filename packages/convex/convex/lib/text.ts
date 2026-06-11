/**
 * Pure string helpers shared across providers, extraction, and explore/feed
 * modeling. Side-effect free so they can be unit tested and reused without
 * duplicating the same one-liners in every leaf module.
 */

/** Collapse internal whitespace runs to single spaces and trim the ends. */
export function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Collapse whitespace and lowercase — a stable dedup/grouping key. */
export function normalizeKey(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Return the number only when it is finite, otherwise `undefined`. */
export function numberOrUndefined(
  value: number | null | undefined,
): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** First value that is non-empty after trimming, or `undefined`. */
export function firstNonEmpty(
  ...values: Array<string | null | undefined>
): string | undefined {
  return values.find((value) => value && value.trim())?.trim();
}

/**
 * Collapse + drop empties, then dedup CASE-SENSITIVELY (preserves original
 * casing, treats "Foo" and "foo" as distinct).
 */
export function uniqueCompact(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => collapse(value ?? "")).filter(Boolean))];
}

/**
 * Collapse + drop empties, then dedup CASE-INSENSITIVELY (keeps the first
 * casing seen, treats "Foo" and "foo" as the same entry). Distinct from
 * {@link uniqueCompact} — do not merge the two.
 */
export function uniqueCompactCI(values: string[]): string[] {
  const seen = new Set<string>();
  return values.map(collapse).filter((value) => {
    if (!value || seen.has(value.toLowerCase())) {
      return false;
    }
    seen.add(value.toLowerCase());
    return true;
  });
}

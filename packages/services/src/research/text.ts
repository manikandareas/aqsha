/**
 * Pure string helpers (no I/O) shared by the research providers. Mirrors the V1
 * `apps/agents/src/lib/text.ts` subset the providers actually use, kept local to
 * the research module so it can be unit-tested in isolation.
 */

/** Collapse internal whitespace runs to single spaces and trim the ends. */
export function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Collapse whitespace and lowercase — a stable cache/dedup key. */
export function normalizeKey(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Coerce a single-or-array XML/JSON shape to an array. */
export function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** First value that is non-empty after trimming, or `undefined`. */
export function firstNonEmpty(...values: Array<string | null | undefined>): string | undefined {
  return values.find((value) => value && value.trim())?.trim();
}

/** Return the number only when finite, otherwise `undefined`. */
export function numberOrUndefined(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Collapse + drop empties, then dedup case-sensitively. */
export function uniqueCompact(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => collapse(value ?? "")).filter(Boolean))];
}

/** Trim a snippet to a max length, collapsing whitespace. */
export function trimForSnippet(value: string | null | undefined, max = 700): string {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

// Pure string helpers ported from packages/convex/convex/lib/text.ts and
// agent/context/contextBudget.ts so the agent service has no Convex import.

/** Collapse internal whitespace runs to single spaces and trim the ends. */
export function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Drop a trailing lone high surrogate. A `.slice` to a fixed length can land
 * between a UTF-16 surrogate pair (e.g. an emoji at the boundary), leaving a
 * lone surrogate — an invalid Unicode string that Convex refuses to store
 * ("Received invalid json: unexpected end of hex escape"). Call after any
 * length-clamping slice whose result is persisted.
 */
export function dropLoneSurrogate(value: string): string {
  if (value.length === 0) return value;
  const lastCode = value.charCodeAt(value.length - 1);
  return lastCode >= 0xd800 && lastCode <= 0xdbff ? value.slice(0, -1) : value;
}

/** Collapse whitespace and lowercase — a stable dedup/grouping key. */
export function normalizeKey(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

/** First value that is non-empty after trimming, or `undefined`. */
export function firstNonEmpty(
  ...values: Array<string | null | undefined>
): string | undefined {
  return values.find((value) => value && value.trim())?.trim();
}

/** Collapse + drop empties, then dedup case-sensitively. */
export function uniqueCompact(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => collapse(value ?? "")).filter(Boolean))];
}

/** Return the number only when it is finite, otherwise `undefined`. */
export function numberOrUndefined(
  value: number | null | undefined,
): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Coerce single-or-array XML/JSON shapes to an array. */
export function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

// Single source of truth for context-assembly budgets (port of
// agent/context/contextBudget.ts — same numbers, same semantics).
export const CONTEXT_BUDGET = {
  /** Total char budget for inlined prompt-context artifact bodies. */
  promptTotalChars: 16_000,
  /** Per-artifact char cap before clipping. */
  perArtifactChars: 4_000,
  /** Max thread-uploaded documents inlined into the prompt. */
  threadDocuments: 4,
  /** Max explicitly-selected context artifacts. */
  selectedArtifacts: 12,
  /** Max workspaces summarized in the workspace manifest. */
  workspaceManifestWorkspaces: 5,
  /** Max items listed per workspace in the manifest. */
  workspaceManifestItems: 40,
  /** Char budget for the retrieved RAG block. */
  ragTotalChars: 6_000,
} as const;

/** Collapse whitespace and clip to a char budget, reporting whether clipped. */
export function clipText(
  value: string,
  limit: number,
): { text: string; clipped: boolean } {
  const compact = collapse(value);
  if (compact.length <= limit) {
    return { text: compact, clipped: false };
  }
  return {
    text: `${dropLoneSurrogate(compact.slice(0, Math.max(0, limit - 3)).trimEnd())}...`,
    clipped: true,
  };
}

/** Trim a snippet to a max length, collapsing whitespace (port of trimForSnippet). */
export function trimForSnippet(value: string | null | undefined, max = 700): string {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) {
    return text;
  }
  return `${dropLoneSurrogate(text.slice(0, max - 3))}...`;
}

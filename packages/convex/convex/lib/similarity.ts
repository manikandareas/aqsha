// Pure string-similarity helpers for citation-integrity matching. Cross-domain
// leaf (no Convex imports) so they stay unit-testable in isolation. No fuzzy
// scorer existed before Phase 2 — this is the one new algorithm the citation
// engine introduces. All scores are in [0, 1]; 1 = identical.

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): string[] {
  const norm = normalize(value);
  return norm ? norm.split(" ") : [];
}

// Levenshtein edit distance (iterative two-row). Titles/venues are short, so
// O(n*m) is fine.
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

// Token-set Jaccard over normalized word sets. Robust to word reordering.
export function tokenJaccard(a: string, b: string): number {
  const setA = new Set(tokens(a));
  const setB = new Set(tokens(b));
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const t of setA) {
    if (setB.has(t)) inter += 1;
  }
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

// Blended title similarity: token-set Jaccard (word-order robust) blended with
// a normalized Levenshtein ratio (typo robust).
export function titleSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na && !nb) return 1;
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const jaccard = tokenJaccard(a, b);
  const maxLen = Math.max(na.length, nb.length);
  const levRatio = maxLen === 0 ? 1 : 1 - levenshtein(na, nb) / maxLen;
  return 0.6 * jaccard + 0.4 * Math.max(0, levRatio);
}

function lastName(name: string): string {
  // Handle both "Ashish Vaswani" (first→last) and "Vaswani, A." (last, initial):
  // when a comma is present the surname is the part before it.
  const comma = name.indexOf(",");
  const base = comma >= 0 ? name.slice(0, comma) : name;
  const parts = normalize(base).split(" ").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

// Fraction of cited authors whose last name appears in the record's author
// list. Returns 1 when there is nothing to compare (no constraint to violate).
export function authorOverlap(
  cited: string[] | undefined,
  record: string[] | undefined,
): number {
  const citedNames = (cited ?? []).map(lastName).filter(Boolean);
  if (citedNames.length === 0) return 1;
  const recordNames = new Set((record ?? []).map(lastName).filter(Boolean));
  if (recordNames.size === 0) return 0;
  let hit = 0;
  for (const name of citedNames) {
    if (recordNames.has(name)) hit += 1;
  }
  return hit / citedNames.length;
}

/**
 * Leaf text helpers — port V1 `convex/lib/text.ts`. Dependency-free; dipakai oleh
 * mapper provider (OpenAlex/explore) + masa depan. (providers.ts P3 punya salinan lokal
 * `collapse`/`numberOrUndefined`; modul ini jadi rumah bersama untuk kode baru.)
 */

/** Collapse whitespace + trim. */
export function collapse(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/** Lowercase collapsed key (cache key normalizer). */
export function normalizeKey(value: string): string {
  return collapse(value).toLowerCase();
}

/** Finite number atau undefined. */
export function numberOrUndefined(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Nilai non-kosong pertama (setelah trim). */
export function firstNonEmpty(...values: Array<string | null | undefined>): string | undefined {
  for (const v of values) {
    const trimmed = (v ?? "").trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

/** Dedup + buang kosong (trim), preserve urutan. */
export function uniqueCompact(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const trimmed = (v ?? "").trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

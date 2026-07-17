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

/**
 * Decode entitas HTML umum (named + numeric dec/hex). Rumah bersama untuk mapper feed/scrape
 * (articlePreview) supaya tak ada decoder yang divergen. Numeric aman via
 * {@link safeFromCodePoint} (code invalid → dibuang, bukan throw).
 */
export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&(?:apos|#39|#x27);/gi, "'")
    .replace(/&(?:hellip|#8230);/gi, "…")
    .replace(/&(?:mdash|#8212);/gi, "—")
    .replace(/&(?:ndash|#8211);/gi, "–")
    .replace(/&(?:ldquo|#8220);/gi, "“")
    .replace(/&(?:rdquo|#8221);/gi, "”")
    .replace(/&(?:lsquo|#8216);/gi, "‘")
    .replace(/&(?:rsquo|#8217);/gi, "’")
    .replace(/&#x2f;/gi, "/")
    .replace(/&#47;/g, "/")
    .replace(/&#(\d+);/g, (_, dec) => safeFromCodePoint(Number(dec)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeFromCodePoint(parseInt(hex, 16)));
}

function safeFromCodePoint(code: number): string {
  try {
    return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : "";
  } catch {
    return "";
  }
}

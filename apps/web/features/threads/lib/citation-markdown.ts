// Parsing penanda sitasi `[n]` / `[n, m]` di prosa jawaban Astra → element kustom `<citation>` yang
// dirender sebagai pill sumber (lihat `components/ai-elements/inline-citation.tsx`). Dua bagian:
//
//  1. `citationRehypePlugin` — rehype plugin yang memindai HAST text node, memecah token `[n]`, dan
//     menyisipkan element `citation` (atribut `citations="1,2"`). Berjalan PALING AKHIR dalam pipeline
//     (lihat `citationRehypePlugins`) sehingga element kita dibuat SETELAH sanitize/harden bawaan
//     Streamdown → tak perlu memperluas skema sanitasi, dan node kode/tautan dilewati.
//  2. `buildCitationMap` — `Map<number, SourceCardData[]>` dari kartu sumber pesan (chat `search-flat`
//     yang membawa `citationNumber`, atau baris `research_sources` deep). Komponen `citation` melihat
//     map ini lewat React Context untuk me-resolve `[n]` → kartu (fallback teks `[n]` bila tak ada).

import { defaultRehypePlugins, type StreamdownProps } from "streamdown";
import type { SourceCardData } from "./timeline-types";

/** Nama tag + atribut element sitasi kustom (dipakai bareng komponen render di message.tsx). */
export const CITATION_TAG = "citation";
export const CITATION_ATTR = "citations";

// `[1]`, `[1, 2]`, `[3,4,5]` — hanya digit + koma di dalam kurung (tak menyentuh `[teks](url)`).
const CITATION_RE = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
// Subtree yang TAK boleh diutak-atik: kode (indeks array `arr[0]`), tautan (label numerik), serta
// element sitasi yang sudah jadi.
const SKIP_TAGS = new Set(["code", "pre", "a", CITATION_TAG]);

// Subset bentuk HAST yang kita pakai — paket tipe `hast` tak terpasang sebagai dependency langsung.
type HastText = { type: "text"; value: string };
type HastElement = {
  type: "element";
  tagName: string;
  properties?: Record<string, unknown>;
  children: HastChild[];
};
type HastChild = HastText | HastElement | { type: string; [k: string]: unknown };
type HastRoot = { type: "root"; children: HastChild[] };

/** Pecah satu text node pada token `[n]` → [teks, <citation>, teks, …]. Tanpa token → node apa adanya. */
function splitTextNode(node: HastText): HastChild[] {
  const value = node.value;
  if (!value.includes("[")) return [node];
  CITATION_RE.lastIndex = 0;
  const out: HastChild[] = [];
  let last = 0;
  let match: RegExpExecArray | null = CITATION_RE.exec(value);
  while (match !== null) {
    if (match.index > last) out.push({ type: "text", value: value.slice(last, match.index) });
    const nums = match[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .join(",");
    out.push({
      type: "element",
      tagName: CITATION_TAG,
      properties: { [CITATION_ATTR]: nums },
      // Teks asli `[n]` jadi anak → fallback yang dirender komponen saat sumber tak ter-resolve.
      children: [{ type: "text", value: match[0] }],
    });
    last = match.index + match[0].length;
    match = CITATION_RE.exec(value);
  }
  if (out.length === 0) return [node];
  if (last < value.length) out.push({ type: "text", value: value.slice(last) });
  return out;
}

/** Rekursi anak HAST: pecah text node, lewati subtree `SKIP_TAGS`. */
function walk(children: HastChild[]): HastChild[] {
  const out: HastChild[] = [];
  for (const child of children) {
    if (child.type === "text") {
      out.push(...splitTextNode(child as HastText));
    } else if (child.type === "element") {
      const el = child as HastElement;
      if (!SKIP_TAGS.has(el.tagName) && Array.isArray(el.children)) {
        el.children = walk(el.children);
      }
      out.push(el);
    } else {
      out.push(child);
    }
  }
  return out;
}

/** Rehype plugin: transform `[n]` → `<citation>` di seluruh pohon. */
function citationRehypePlugin() {
  return (tree: HastRoot) => {
    if (Array.isArray(tree.children)) tree.children = walk(tree.children);
  };
}

/**
 * Pipeline rehype lengkap untuk jawaban tercitasi: plugin bawaan Streamdown (raw → sanitize → harden)
 * lalu transform sitasi di urutan TERAKHIR. Kita merekonstruksi default-nya karena meneruskan prop
 * `rehypePlugins` MENGGANTIKAN seluruh default (bukan menambah); menjalankan transform setelah sanitize
 * berarti element `citation` kita tepercaya (dibuat dari teks yang sudah bersih) tanpa perlu allowlist.
 * Referensi modul-level yang stabil → memo Block Streamdown tetap valid.
 */
export const citationRehypePlugins = [
  ...Object.values(defaultRehypePlugins as unknown as Record<string, unknown>),
  citationRehypePlugin,
] as NonNullable<StreamdownProps["rehypePlugins"]>;

/**
 * `Map<number, SourceCardData[]>` dari daftar kartu sumber (chat `search-flat` ber-`citationNumber`,
 * atau baris `research_sources` deep). Satu nomor bisa memetakan ke beberapa kartu (deep men-dedup
 * paper sama lintas sub-pertanyaan ke nomor sama). Kartu tanpa `citationNumber` dilewati.
 */
export function buildCitationMap(cards: SourceCardData[]): Map<number, SourceCardData[]> {
  const map = new Map<number, SourceCardData[]>();
  for (const card of cards) {
    const n = card.citationNumber;
    if (n == null) continue;
    const list = map.get(n);
    if (list) list.push(card);
    else map.set(n, [card]);
  }
  return map;
}

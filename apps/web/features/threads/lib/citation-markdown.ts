// Parsing penanda sitasi `[n]` / `[n, m]` di prosa jawaban Astra → element kustom `<citation>` yang
// dirender sebagai pill sumber (lihat `components/ai-elements/inline-citation.tsx`). Dua bagian:
//
//  1. `reportRehypePlugin` — rehype plugin (SATU traversal) yang memindai HAST: text node dipecah
//     pada token `[n]` → element `citation` (atribut `citations="1,2"`), dan `pre>code` ber-bahasa
//     `aqsha:viz` → element `deepviz` (helper `viz-markdown.ts`). Berjalan PALING AKHIR dalam
//     pipeline (lihat `reportRehypePlugins`) sehingga element kita dibuat SETELAH sanitize/harden
//     bawaan Streamdown → tak perlu memperluas skema sanitasi, dan node kode/tautan dilewati.
//  2. `buildCitationMap` — `Map<number, SourceCardData[]>` dari kartu sumber pesan (chat `search-flat`
//     yang membawa `citationNumber`, atau baris `research_sources` deep). Komponen `citation` melihat
//     map ini lewat React Context untuk me-resolve `[n]` → kartu (fallback teks `[n]` bila tak ada).

import { defaultRehypePlugins, type StreamdownProps } from "streamdown";
import { splitStatsMarkers, STATS_VIZ_TAG } from "./stats-markdown";
import type { SourceCardData } from "./timeline-types";
import { DEEP_VIZ_TAG, vizElementFromPre } from "./viz-markdown";

/** Nama tag + atribut element sitasi kustom (dipakai bareng komponen render di message.tsx). */
export const CITATION_TAG = "citation";
export const CITATION_ATTR = "citations";

// `[1]`, `[1, 2]`, `[3,4,5]` — hanya digit + koma di dalam kurung (tak menyentuh `[teks](url)`).
const CITATION_RE = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
// Subtree yang TAK boleh diutak-atik: kode (indeks array `arr[0]`), tautan (label numerik), serta
// element sitasi/viz yang sudah jadi.
const SKIP_TAGS = new Set(["code", "pre", "a", CITATION_TAG, DEEP_VIZ_TAG, STATS_VIZ_TAG]);

// Subset bentuk HAST yang kita pakai — paket tipe `hast` tak terpasang sebagai dependency
// langsung. Diekspor untuk plugin rehype saudara (`viz-markdown.ts`) — satu definisi bersama.
export type HastText = { type: "text"; value: string };
export type HastElement = {
  type: "element";
  tagName: string;
  properties?: Record<string, unknown>;
  children: HastChild[];
};
export type HastChild = HastText | HastElement | { type: string; [k: string]: unknown };
export type HastRoot = { type: "root"; children: HastChild[] };

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

/**
 * `<statsviz>` (blok tabel/figur) yang menempati SATU paragraf sendiri di-hoist keluar dari
 * `<p>` (blok tak boleh jadi keturunan `<p>` — memicu `validateDOMNesting` + margin ganda).
 * Penanda yang ditulis model pada baris tersendiri (sesuai instruksi) → paragraf berisi hanya
 * `<statsviz>` + whitespace → kembalikan elemen statsviz saja. Paragraf campur (penanda di
 * tengah kalimat, jarang) tetap utuh (dirender inline; jarang, dampak kosmetik kecil).
 */
function hoistStandaloneStats(el: HastElement): HastChild[] {
  const statsviz = el.children.filter(
    (c) => c.type === "element" && (c as HastElement).tagName === STATS_VIZ_TAG,
  );
  if (statsviz.length === 0) return [el];
  const hasOtherContent = el.children.some((c) => {
    if (c.type === "text") return (c as HastText).value.trim() !== "";
    if (c.type === "element") return (c as HastElement).tagName !== STATS_VIZ_TAG;
    return true;
  });
  return hasOtherContent ? [el] : statsviz;
}

/** Rekursi anak HAST: pecah text node, ganti `pre` viz → `deepviz`, lewati subtree `SKIP_TAGS`. */
function walk(children: HastChild[]): HastChild[] {
  const out: HastChild[] = [];
  for (const child of children) {
    if (child.type === "text") {
      // Sitasi `[n]` dulu → dari tiap sisa teks, pisah penanda `{{stats:<runKey>}}` → `<statsviz>`.
      for (const piece of splitTextNode(child as HastText)) {
        if (piece.type === "text") out.push(...splitStatsMarkers(piece as HastText));
        else out.push(piece);
      }
    } else if (child.type === "element") {
      const el = child as HastElement;
      if (el.tagName === "pre") {
        // Satu-satunya transform di dalam `pre`: fence `aqsha:viz` → `deepviz`; `pre` lain
        // dilewati utuh (sitasi tak boleh menyentuh kode).
        out.push(vizElementFromPre(el) ?? el);
        continue;
      }
      if (!SKIP_TAGS.has(el.tagName) && Array.isArray(el.children)) {
        el.children = walk(el.children);
      }
      // Paragraf yang hanya berisi penanda stats → hoist blok tabel/figur ke level atas.
      if (el.tagName === "p") {
        out.push(...hoistStandaloneStats(el));
        continue;
      }
      out.push(el);
    } else {
      out.push(child);
    }
  }
  return out;
}

/** Rehype plugin: transform `[n]` → `<citation>` dan fence `aqsha:viz` → `<deepviz>` — satu traversal. */
function reportRehypePlugin() {
  return (tree: HastRoot) => {
    if (Array.isArray(tree.children)) tree.children = walk(tree.children);
  };
}

// Stage bawaan Streamdown yang HARUS ikut saat kita merekonstruksi pipeline (kunci `sanitize`/`harden`
// di `defaultRehypePlugins`). Meneruskan prop `rehypePlugins` MENGGANTIKAN seluruh default Streamdown,
// jadi kalau rekonstruksi ini kehilangan `sanitize`, HTML model mentah lolos tanpa sanitasi.
const REQUIRED_DEFAULT_REHYPE_STAGES = ["sanitize"] as const;

/**
 * Guard asumsi versi-terpin: Streamdown menerapkan prop `rehypePlugins` sebagai PENGGANTI pipeline
 * default-nya (raw → sanitize → harden), jadi kita merekonstruksi default via `Object.values`. Jika
 * upgrade Streamdown mengubah bentuk `defaultRehypePlugins` (mis. men-drop/me-rename stage `sanitize`),
 * gagal NYARING di sini (dev/test/build) — bukan diam-diam mengirim HTML asisten tak ter-sanitasi.
 */
const defaultRehypeStageKeys = Object.keys(defaultRehypePlugins ?? {});
if (process.env.NODE_ENV !== "production") {
  const missing = REQUIRED_DEFAULT_REHYPE_STAGES.filter((k) => !defaultRehypeStageKeys.includes(k));
  if (missing.length > 0) {
    throw new Error(
      `[citation-markdown] Streamdown defaultRehypePlugins kehilangan stage [${missing.join(", ")}] ` +
        `(stage tersedia: ${defaultRehypeStageKeys.join(", ") || "<kosong>"}). Sanitasi markdown asisten ` +
        "bisa hilang — tinjau ulang citationRehypePlugins setelah upgrade Streamdown.",
    );
  }
}

/**
 * Pipeline rehype lengkap untuk jawaban laporan: plugin bawaan Streamdown (raw → sanitize → harden)
 * lalu transform sitasi `[n]` → `<citation>` + fence `aqsha:viz` → `<deepviz>` (satu walk) di
 * urutan TERAKHIR. Kita merekonstruksi default-nya karena meneruskan prop `rehypePlugins`
 * MENGGANTIKAN seluruh default (bukan menambah); menjalankan transform setelah sanitize berarti
 * element kustom kita tepercaya (dibuat dari pohon yang sudah bersih) tanpa perlu allowlist.
 * Referensi modul-level yang stabil → memo Block Streamdown tetap valid.
 */
export const reportRehypePlugins = [
  ...Object.values(defaultRehypePlugins as unknown as Record<string, unknown>),
  reportRehypePlugin,
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

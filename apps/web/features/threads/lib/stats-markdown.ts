// Deteksi penanda `{{stats:<runKey>}}` di prosa jawaban (ditulis model saat menempatkan hasil
// `run_analysis`) → element kustom `<statsviz runkey="…">` yang dirender `StatsVizMarkdownComponent`
// (features/threads/components/stats-viz). Transformasinya dijalankan oleh walk tunggal
// `reportRehypePlugin` di `citation-markdown.ts` — PALING AKHIR dalam pipeline, SETELAH
// sanitize/harden Streamdown, jadi element kita tepercaya tanpa memperluas skema sanitasi.
//
// BEDA dengan deep-viz (fence ```aqsha:viz berisi data): di sini penanda hanyalah kunci; DATA
// blok (tabel/verdict/PNG) di-fetch FE dari DB (`analysis_result_blocks`) lalu di-join lewat
// `StatsBlocksProvider`. Anti-pemalsuan = penanda hanya jadi figur bila `runKey` punya blok ASLI.
// Nomor "Tabel n"/"Gambar n" dihitung provider saat render (urutan dokumen).

import type { HastChild, HastText } from "./citation-markdown";

/** Nama tag + atribut element stats kustom (dipakai bareng komponen render di message.tsx). */
export const STATS_VIZ_TAG = "statsviz";
export const STATS_VIZ_RUNKEY_ATTR = "runkey";

// Regex LOKAL (bukan impor global chat-core) supaya state `lastIndex` tak berbagi antar pemakai.
const MARKER_RE = /\{\{stats:([a-z0-9-]{1,64})\}\}/g;

/**
 * Pecah satu text node pada penanda `{{stats:<runKey>}}` → [teks, `<statsviz>`, teks, …].
 * Tanpa penanda → node apa adanya. Penanda TANPA blok asli tetap jadi element (komponen render
 * kosong) → token mentah `{{stats:…}}` tak pernah bocor ke pengguna.
 */
export function splitStatsMarkers(node: HastText): HastChild[] {
  const value = node.value;
  if (!value.includes("{{stats:")) return [node];
  MARKER_RE.lastIndex = 0;
  const out: HastChild[] = [];
  let last = 0;
  let match: RegExpExecArray | null = MARKER_RE.exec(value);
  while (match !== null) {
    if (match.index > last) out.push({ type: "text", value: value.slice(last, match.index) });
    out.push({
      type: "element",
      tagName: STATS_VIZ_TAG,
      properties: { [STATS_VIZ_RUNKEY_ATTR]: match[1] },
      children: [],
    });
    last = match.index + match[0].length;
    match = MARKER_RE.exec(value);
  }
  if (out.length === 0) return [node];
  if (last < value.length) out.push({ type: "text", value: value.slice(last) });
  return out;
}

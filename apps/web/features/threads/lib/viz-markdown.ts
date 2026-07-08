// Deteksi fenced block ` ```aqsha:viz ` (JSON blok evidence viz laporan `/deep`, disuntik
// `injectVizBlocks` di agent) → element kustom `<deepviz payload="…">` yang dirender
// `DeepVizMarkdownComponent` (features/threads/components/deep-viz). Transformasinya dijalankan
// oleh walk tunggal `reportRehypePlugin` di `citation-markdown.ts` — PALING AKHIR dalam pipeline,
// SETELAH sanitize/harden Streamdown, jadi element kita tepercaya tanpa memperluas skema
// sanitasi; skema default rehype-sanitize mempertahankan `className` code ber-pola `language-*`
// sehingga info string `aqsha:viz` selamat sampai ke sini. Karena node `pre>code` diganti SEBELUM
// mapping komponen, plugin `code` Streamdown (syntax highlight) tak pernah menyentuhnya.
//
// Nomor "Gambar n" TIDAK dihitung di sini: injector chat-core sudah men-stamp `figure` di payload
// sesuai urutan dokumen final (Streamdown me-render markdown per blok, jadi counter di plugin
// tak pernah bisa melihat urutan lintas-blok).

import type { HastElement, HastText } from "./citation-markdown";

/** Nama tag + atribut element viz kustom (dipakai bareng komponen render di message.tsx). */
export const DEEP_VIZ_TAG = "deepviz";
export const DEEP_VIZ_PAYLOAD_ATTR = "payload";

const VIZ_LANGUAGE_CLASS = "language-aqsha:viz";

/** `code` anak `pre` ber-class `language-aqsha:viz` (className bisa array ATAU string). */
function vizCodeChild(pre: HastElement): HastElement | null {
  for (const child of pre.children) {
    if (child.type !== "element") continue;
    const el = child as HastElement;
    if (el.tagName !== "code") continue;
    const className = el.properties?.className;
    const classes = Array.isArray(className)
      ? className.map(String)
      : typeof className === "string"
        ? className.split(/\s+/)
        : [];
    if (classes.includes(VIZ_LANGUAGE_CLASS)) return el;
  }
  return null;
}

/** Gabungan seluruh text node langsung di bawah `code` (payload JSON satu baris). */
function codeText(code: HastElement): string {
  return code.children
    .filter((c): c is HastText => c.type === "text")
    .map((c) => c.value)
    .join("")
    .trim();
}

/**
 * `pre > code.language-aqsha:viz` → element `deepviz` ber-atribut `payload` (string JSON —
 * divalidasi komponen via zod contract chat-core, fallback bila korup); `pre` lain → `null`
 * (biarkan apa adanya).
 */
export function vizElementFromPre(pre: HastElement): HastElement | null {
  const code = vizCodeChild(pre);
  if (!code) return null;
  return {
    type: "element",
    tagName: DEEP_VIZ_TAG,
    properties: { [DEEP_VIZ_PAYLOAD_ATTR]: codeText(code) },
    children: [],
  };
}

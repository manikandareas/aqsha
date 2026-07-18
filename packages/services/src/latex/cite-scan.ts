/**
 * Pemindai perintah sitasi biblatex dari sumber LaTeX — dasar rekonsiliasi
 * document_citation_usages saat save. Pragmatis (regex, bukan parser TeX): cukup
 * untuk perintah sitasi umum; key yang tak dikenal di perpustakaan diabaikan caller.
 */

// Varian multi (\cites{a}{b}) mengambil SEMUA grup kurawal beruntun; perintah tunggal
// hanya grup pertama (grup kedua di prosa bukan bagian perintah).
const MULTI_CITE = new Set([
  "cites",
  "parencites",
  "textcites",
  "autocites",
  "footcites",
  "smartcites",
]);

// Alternation: bentuk plural lebih dulu supaya "cites" tak termakan "cite".
const CITE_RE =
  /\\(cites|Cites|parencites|Parencites|textcites|Textcites|autocites|Autocites|footcites|smartcites|cite|Cite|parencite|Parencite|textcite|Textcite|autocite|Autocite|footcite|fullcite|smartcite|Smartcite|nocite)\*?\s*((?:\[[^\]\n]*\]\s*)*)((?:\{[^{}]*\}\s*)+)/g;

/** Buang komentar TeX (% sampai akhir baris) dengan menghormati escape \%. */
export function stripTexComments(source: string): string {
  return source
    .split("\n")
    .map((line) => {
      let from = 0;
      while (true) {
        const idx = line.indexOf("%", from);
        if (idx === -1) return line;
        if (idx > 0 && line[idx - 1] === "\\") {
          from = idx + 1;
          continue;
        }
        return line.slice(0, idx);
      }
    })
    .join("\n");
}

/** Semua key sitasi dalam urutan kemunculan (duplikat dipertahankan). */
export function scanCiteKeys(source: string): string[] {
  const text = stripTexComments(source);
  const out: string[] = [];
  for (const match of text.matchAll(CITE_RE)) {
    const command = match[1]!;
    const braces = [...match[3]!.matchAll(/\{([^{}]*)\}/g)].map((b) => b[1] ?? "");
    const groups = MULTI_CITE.has(command.toLowerCase()) ? braces : braces.slice(0, 1);
    for (const group of groups) {
      for (const raw of group.split(",")) {
        const key = raw.trim();
        if (key && key !== "*") out.push(key);
      }
    }
  }
  return out;
}

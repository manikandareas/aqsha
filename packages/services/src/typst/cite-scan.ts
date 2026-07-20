/**
 * Pemindai sitasi Typst — dasar rekonsiliasi document_citation_usages saat save.
 * Pragmatis (regex, bukan parser Typst): menangkap `@key` (shorthand ref) dan label di
 * dalam `#cite(<key>)`, dalam urutan kemunculan (duplikat dipertahankan). Key yang tak
 * dikenal di perpustakaan diabaikan caller.
 */

const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT = /\/\/[^\n]*/g;
// `@key` shorthand: didahului awal-baris/non-word (bukan bagian email `a@b`); key mulai alnum.
const REF_RE = /(^|[^\w@])@([A-Za-z0-9][\w:.-]*)/g;
// Panggilan `#cite(...)`; label `<key>` diekstrak dari argumennya.
const CITE_CALL_RE = /#cite\s*\(([^)]*)\)/g;
const LABEL_RE = /<([A-Za-z0-9][\w:.-]*)>/g;

/** Buang komentar Typst (baris `//` dan komentar blok) sebelum scan. */
export function stripTypstComments(source: string): string {
  return source.replace(BLOCK_COMMENT, "").replace(LINE_COMMENT, "");
}

/** Buang pemisah di ujung (mis. tanda titik akhir kalimat pada `@key.`). */
function trimKey(key: string): string {
  return key.replace(/[.\-:]+$/, "");
}

/** Semua key sitasi dalam urutan kemunculan (duplikat dipertahankan). */
export function scanTypstCiteKeys(source: string): string[] {
  const text = stripTypstComments(source);
  const found: { index: number; key: string }[] = [];
  for (const m of text.matchAll(REF_RE)) {
    const key = trimKey(m[2]!);
    if (key) found.push({ index: (m.index ?? 0) + (m[1]?.length ?? 0), key });
  }
  for (const call of text.matchAll(CITE_CALL_RE)) {
    const base = call.index ?? 0;
    for (const lm of call[1]!.matchAll(LABEL_RE)) {
      const key = trimKey(lm[1]!);
      if (key) found.push({ index: base + (lm.index ?? 0), key });
    }
  }
  found.sort((a, b) => a.index - b.index);
  return found.map((f) => f.key);
}

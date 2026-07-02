/**
 * Formatter daftar pustaka deterministik (FEAT-3) — APA 7 / BibTeX / RIS dari metadata
 * `research_sources` ASLI (bukan ingatan model). Dipakai tool agent `format_references`
 * (APA 7 in-chat) + route export `GET /threads/:id/references` (.bib/.ris).
 *
 * Batas yang disengaja (keputusan owner 2026-07-02):
 * - `authors` di DB ter-cap 3 (CTX-8) — saat tepat 3 penulis tersimpan kita TIDAK bisa
 *   membedakan "memang 3" vs "terpotong dari >3", jadi entri 3-penulis diberi "et al."
 *   (BibTeX: "and others"). Entri tetap resolvable via DOI/URL.
 * - Gaya teks hanya APA 7 (konvensi produk, selaras skill `cite-apa7`); gaya lain tetap
 *   tanggung jawab model dengan metadata yang sama.
 */

import { normalizeDoi } from "../papers/identifiers";

/** Subset metadata satu sumber yang dibutuhkan formatter (kompatibel `ResearchSourceItem`). */
export type ReferenceSourceInput = {
  citationNumber: number | null;
  origin: "web" | "arxiv" | "doi";
  title: string;
  locator: string;
  url: string | null;
  doi: string | null;
  arxivId: string | null;
  /** Penulis dari metadata provider (maks 3 — lihat catatan cap di header modul). */
  authors: string[];
  year: number | null;
  venue: string | null;
};

/** Jumlah penulis tersimpan yang menandakan KEMUNGKINAN terpotong (cap kolom CTX-8). */
const AUTHOR_CAP = 3;

/**
 * Dedup lintas turn: `research_sources` unik per (thread, turn, locator) sehingga sumber yang
 * sama muncul lagi di turn lain. Kunci samadengan `assignCitationNumbers`: DOI ternormalisasi ??
 * arXiv id ?? locator. Pemenang = baris pertama; nomor sitasi & metadata terisi menang atas null.
 */
export function dedupeReferenceSources<T extends ReferenceSourceInput>(sources: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const s of sources) {
    const key = (s.doi && normalizeDoi(s.doi)) || s.arxivId || s.locator;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, s);
      continue;
    }
    // Pertahankan baris terdahulu, tapi isi lubang metadata dari baris duplikat.
    byKey.set(key, {
      ...existing,
      citationNumber: existing.citationNumber ?? s.citationNumber,
      authors: existing.authors.length > 0 ? existing.authors : s.authors,
      year: existing.year ?? s.year,
      venue: existing.venue ?? s.venue,
      doi: existing.doi ?? s.doi,
      arxivId: existing.arxivId ?? s.arxivId,
      url: existing.url ?? s.url,
    });
  }
  return [...byKey.values()];
}

/** "Vito Andareas Manik" → { family: "Manik", given: "Vito Andareas" }. Nama tunggal: family saja. */
function splitName(display: string): { family: string; given: string } {
  const parts = display.trim().split(/\s+/);
  if (parts.length <= 1) return { family: parts[0] ?? "", given: "" };
  return { family: parts[parts.length - 1]!, given: parts.slice(0, -1).join(" ") };
}

/** "Vito Andareas Manik" → "Manik, V. A." (APA). Nama tunggal apa adanya. */
function apaAuthorName(display: string): string {
  const { family, given } = splitName(display);
  if (!given) return family;
  const initials = given
    .split(/\s+/)
    .map((p) => `${p[0]!.toUpperCase()}.`)
    .join(" ");
  return `${family}, ${initials}`;
}

/** Rangkai penulis gaya APA: "A." / "A., & B." / "A., B., & C." (+ " et al." saat mungkin ter-cap). */
function apaAuthors(authors: string[]): string {
  const names = authors.map(apaAuthorName).filter(Boolean);
  if (names.length === 0) return "";
  const capped = authors.length >= AUTHOR_CAP;
  const joined =
    names.length === 1
      ? names[0]!
      : `${names.slice(0, -1).join(", ")}, & ${names[names.length - 1]}`;
  return capped ? `${joined}, et al.` : joined;
}

/** Pastikan string diakhiri titik (judul/venue tanpa trailing period ganda). */
function dot(text: string): string {
  const t = text.trim();
  if (!t) return "";
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

function referenceLink(s: ReferenceSourceInput): string {
  const doi = s.doi ? normalizeDoi(s.doi) : "";
  if (doi) return `https://doi.org/${doi}`;
  if (s.arxivId) return `https://arxiv.org/abs/${s.arxivId}`;
  return s.url ?? s.locator;
}

/**
 * Satu entri APA 7. Pola: `Penulis (Tahun). Judul. *Venue*. URL/DOI`. Bagian yang tak ada
 * dilewati; tanpa tahun → `(t.t.)` (padanan "n.d." — reference list produk berbahasa Indonesia,
 * selaras skill `cite-apa7`).
 */
export function formatApa7Reference(s: ReferenceSourceInput): string {
  const authors = apaAuthors(s.authors);
  const year = s.year ? `(${s.year}).` : "(t.t.).";
  const venue = s.venue ? `*${s.venue.trim().replace(/\.$/, "")}*.` : s.arxivId ? "arXiv." : "";
  const parts = [authors ? dot(authors) : "", year, dot(s.title), venue, referenceLink(s)];
  return parts.filter(Boolean).join(" ");
}

/** Urutan reference list APA: alfabetis penulis pertama (fallback judul), case-insensitive. */
export function sortForReferenceList<T extends ReferenceSourceInput>(sources: T[]): T[] {
  return [...sources].sort((a, b) => {
    const ka = (a.authors[0] ? splitName(a.authors[0]).family : a.title).toLowerCase();
    const kb = (b.authors[0] ? splitName(b.authors[0]).family : b.title).toLowerCase();
    return ka.localeCompare(kb);
  });
}

/** Kunci sitasi BibTeX ASCII-aman: `manik2024judul`; tabrakan diberi sufiks `b`, `c`, … */
function bibtexKey(s: ReferenceSourceInput, taken: Set<string>): string {
  const family = s.authors[0] ? splitName(s.authors[0]).family : "anon";
  const firstWord = s.title.split(/\s+/)[0] ?? "untitled";
  const base =
    `${family}${s.year ?? ""}${firstWord}`
      .normalize("NFD")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase() || "ref";
  let key = base;
  let suffix = "b".charCodeAt(0);
  while (taken.has(key)) key = `${base}${String.fromCharCode(suffix++)}`;
  taken.add(key);
  return key;
}

/** Escape nilai field BibTeX minimal ({}, %, \) — konten dari metadata provider, bukan TeX. */
function bibtexValue(text: string): string {
  return text.replace(/[\\{}]/g, "").replace(/%/g, "\\%").trim();
}

function bibtexAuthors(authors: string[]): string {
  const names = authors
    .map((a) => {
      const { family, given } = splitName(a);
      return given ? `${family}, ${given}` : family;
    })
    .filter(Boolean);
  if (names.length === 0) return "";
  // Cap 3 (lihat header modul): "and others" → renderer menampilkan "et al."
  return authors.length >= AUTHOR_CAP ? `${names.join(" and ")} and others` : names.join(" and ");
}

/** Ekspor BibTeX seluruh daftar (jurnal ber-venue → @article, arXiv/web → @misc). */
export function formatBibtex(sources: ReferenceSourceInput[]): string {
  const taken = new Set<string>();
  return sources
    .map((s) => {
      const doi = s.doi ? normalizeDoi(s.doi) : "";
      const type = doi && s.venue ? "article" : "misc";
      const fields: Array<[string, string]> = [];
      const authors = bibtexAuthors(s.authors);
      if (authors) fields.push(["author", authors]);
      fields.push(["title", bibtexValue(s.title)]);
      if (type === "article" && s.venue) fields.push(["journal", bibtexValue(s.venue)]);
      if (s.year) fields.push(["year", String(s.year)]);
      if (doi) fields.push(["doi", doi]);
      if (s.arxivId) {
        fields.push(["eprint", s.arxivId]);
        fields.push(["archiveprefix", "arXiv"]);
      }
      fields.push(["url", referenceLink(s)]);
      const body = fields.map(([k, v]) => `  ${k} = {${v}}`).join(",\n");
      return `@${type}{${bibtexKey(s, taken)},\n${body}\n}`;
    })
    .join("\n\n");
}

/** Ekspor RIS (jurnal → TY JOUR, arXiv/web → TY GEN/ELEC) — importable Zotero/Mendeley. */
export function formatRis(sources: ReferenceSourceInput[]): string {
  return sources
    .map((s) => {
      const doi = s.doi ? normalizeDoi(s.doi) : "";
      const type = doi && s.venue ? "JOUR" : s.origin === "web" ? "ELEC" : "GEN";
      const lines = [`TY  - ${type}`];
      for (const a of s.authors) {
        const { family, given } = splitName(a);
        lines.push(`AU  - ${given ? `${family}, ${given}` : family}`);
      }
      lines.push(`TI  - ${s.title}`);
      if (s.venue) lines.push(`JO  - ${s.venue}`);
      if (s.year) lines.push(`PY  - ${s.year}`);
      if (doi) lines.push(`DO  - ${doi}`);
      lines.push(`UR  - ${referenceLink(s)}`);
      lines.push("ER  - ");
      return lines.join("\n");
    })
    .join("\n");
}

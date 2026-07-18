/**
 * Assembly dokumen LaTeX: preamble stateless + body per-bab + titik sisip bibliografi.
 * Pure (tanpa Bun/IO) supaya deterministik & teruji unit.
 *
 * Kontrak body: sumber bab TIDAK memuat \chapter — heading disisipkan di mainTex dari
 * judul section (rename di UI otomatis sinkron; agen hanya menulis isi). Body ditulis
 * verbatim ke file terpisah `sections/<id>.tex` yang di-\input → SyncTeX mengatribusi
 * baris langsung ke file bab tanpa aritmetika offset.
 */

export type AssemblyProjectInput = {
  title: string;
  author?: string | null;
  kind: string;
  styleId: string;
};

export type AssemblySectionInput = {
  id: string;
  title: string;
  sortOrder: number;
  role: string | null;
  source: string | null;
};

export type AssembledDocument = {
  mainTex: string;
  extraFiles: Record<string, Uint8Array>;
};

const REPORT_KINDS = new Set(["undergraduate_thesis", "masters_thesis", "dissertation"]);

// Mapping CitationStyleId → style biblatex. Paket apa/ieee/chicago harus tercache di
// bundle offline Tectonic; miss muncul sebagai latex_bundle_missing (sinyal ops).
// vancouver belum punya paket di bundle → numeric (fallback terdekat).
const BIBLATEX_STYLE: Record<string, string> = {
  "apa-7": "apa",
  ieee: "ieee",
  "chicago-author-date": "chicago-authordate",
  vancouver: "numeric",
};
const FALLBACK_STYLE = "authoryear";

const encoder = new TextEncoder();

export function escapeLatex(value: string): string {
  // Single-pass supaya hasil escape tidak ter-escape ulang oleh pass berikutnya.
  return value.replace(/[\\&%$#_{}~^]/g, (ch) => {
    switch (ch) {
      case "\\":
        return "\\textbackslash{}";
      case "~":
        return "\\textasciitilde{}";
      case "^":
        return "\\textasciicircum{}";
      default:
        return `\\${ch}`;
    }
  });
}

function headingCommand(kind: string): "chapter" | "section" {
  return REPORT_KINDS.has(kind) ? "chapter" : "section";
}

export function sectionFilePath(sectionId: string): string {
  return `sections/${sectionId}.tex`;
}

export function buildPreamble(input: AssemblyProjectInput): string {
  const documentclass = REPORT_KINDS.has(input.kind) ? "report" : "article";
  const style = BIBLATEX_STYLE[input.styleId] ?? FALLBACK_STYLE;
  return [
    `\\documentclass[12pt]{${documentclass}}`,
    "\\usepackage{amsmath}",
    "\\usepackage{graphicx}",
    `\\usepackage[backend=biber,style=${style}]{biblatex}`,
    "\\addbibresource{refs.bib}",
    `\\title{${escapeLatex(input.title)}}`,
    `\\author{${escapeLatex(input.author ?? "")}}`,
    "\\date{}",
  ].join("\n");
}

/** Dokumen per-bab (loop edit cepat): nomor bab dipaksa mengikuti posisi di kerangka. */
export function assembleSection(
  project: AssemblyProjectInput,
  section: AssemblySectionInput,
): AssembledDocument {
  const heading = headingCommand(project.kind);
  const filePath = sectionFilePath(section.id);
  const mainTex = [
    buildPreamble(project),
    "\\begin{document}",
    // sort_order 0-based; \chapter menaikkan counter → nomor tampil sortOrder+1,
    // sama dengan posisinya di dokumen penuh.
    `\\setcounter{${heading}}{${Math.max(0, section.sortOrder)}}`,
    `\\${heading}{${escapeLatex(section.title)}}`,
    `\\input{${filePath}}`,
    "\\printbibliography",
    "\\end{document}",
    "",
  ].join("\n");
  return { mainTex, extraFiles: { [filePath]: encoder.encode(section.source ?? "") } };
}

/** Dokumen penuh: semua bab urut kerangka; section role=bibliography → \printbibliography. */
export function assembleWorkspace(
  project: AssemblyProjectInput,
  sections: AssemblySectionInput[],
): AssembledDocument {
  const heading = headingCommand(project.kind);
  const ordered = [...sections].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
  );
  const lines = [buildPreamble(project), "\\begin{document}", "\\maketitle"];
  const extraFiles: Record<string, Uint8Array> = {};
  let hasBibliography = false;
  for (const section of ordered) {
    if (section.role === "bibliography") {
      lines.push("\\printbibliography");
      hasBibliography = true;
      continue;
    }
    if (section.source == null) continue;
    const filePath = sectionFilePath(section.id);
    lines.push(`\\${heading}{${escapeLatex(section.title)}}`, `\\input{${filePath}}`);
    extraFiles[filePath] = encoder.encode(section.source);
  }
  if (!hasBibliography) lines.push("\\printbibliography");
  lines.push("\\end{document}", "");
  return { mainTex: lines.join("\n"), extraFiles };
}

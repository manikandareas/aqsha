import type { CitationStyleId, WorkspaceKind, WorkspaceKindInfo } from "@aqsha/db";

/** Peta gaya sitasi internal → nama style bawaan Typst (`#bibliography(style: …)`). */
const TYPST_BIB_STYLE: Record<CitationStyleId, string> = {
  "apa-7": "american-psychological-association",
  ieee: "ieee",
  // "vancouver" masih diterima Typst tapi deprecated → nama non-deprecated agar preview tak warning.
  vancouver: "nlm-citation-sequence",
  "chicago-author-date": "chicago-author-date",
};

/** Judul bab awal per kind (Typst menomori otomatis lewat `#set heading(numbering)`). */
const SCAFFOLD_HEADINGS: Record<WorkspaceKind, string[]> = {
  undergraduate_thesis: [
    "Pendahuluan",
    "Tinjauan Pustaka",
    "Metodologi Penelitian",
    "Hasil dan Pembahasan",
    "Penutup",
  ],
  masters_thesis: [
    "Pendahuluan",
    "Kajian Pustaka",
    "Metodologi Penelitian",
    "Hasil dan Pembahasan",
    "Kesimpulan dan Saran",
  ],
  dissertation: [
    "Pendahuluan",
    "Kajian Pustaka",
    "Kerangka Konseptual dan Hipotesis",
    "Metodologi Penelitian",
    "Hasil dan Pembahasan",
    "Kesimpulan dan Implikasi",
  ],
  journal_article: ["Pendahuluan", "Metode", "Hasil", "Pembahasan", "Kesimpulan"],
  proposal: ["Pendahuluan", "Tinjauan Pustaka", "Metodologi Penelitian", "Jadwal Penelitian"],
  paper: ["Pendahuluan", "Pembahasan", "Penutup"],
  freeform: [],
};

const THESIS_FAMILY: ReadonlySet<WorkspaceKind> = new Set<WorkspaceKind>([
  "undergraduate_thesis",
  "masters_thesis",
  "dissertation",
  "proposal",
]);

export type ScaffoldTypstOptions = {
  title?: string;
  authorName?: string;
  year?: number;
  kindInfo?: WorkspaceKindInfo | null;
  citationStyle?: CitationStyleId;
};

/** Escape teks pengguna agar aman disisipkan sebagai konten markup Typst. */
function escapeTypst(value: string): string {
  return value.replace(/[\\#$*_`~@<>[\]]/g, (c) => `\\${c}`);
}

function titlePage(title: string, opts: ScaffoldTypstOptions): string {
  const info = opts.kindInfo ?? {};
  // Field kosong dilewati rapi (decision desain): hanya baris terisi yang muncul.
  const metaLines = [
    opts.authorName,
    info.studyProgram,
    info.faculty,
    info.university,
    opts.year ? String(opts.year) : null,
  ]
    .map((v) => v?.toString().trim())
    .filter((v): v is string => Boolean(v))
    .map(escapeTypst);
  const meta = metaLines.length ? `\n\n  #v(2cm)\n\n  ${metaLines.join("\n\n  ")}` : "";
  return [
    "#align(center)[",
    "  #v(3cm)",
    `  #text(size: 18pt, weight: "bold")[${escapeTypst(title)}]${meta}`,
    "]",
    "#pagebreak()",
    "",
  ].join("\n");
}

/**
 * Bangun sumber Typst awal satu proyek dari `kind` + `kindInfo` — murni (deterministik untuk
 * `year` yang diberikan). Preamble `#set` minimal (font Inter, teks Indonesia, heading bernomor),
 * halaman judul untuk thesis-family (field kosong dilewati), heading bab standar, dan
 * `#bibliography` (kecuali freeform). Konstruksi konservatif agar kompatibel dengan preview WASM,
 * CLI ekspor, dan pandoc (`-f typst`).
 */
export function scaffoldTypstDocument(kind: WorkspaceKind, opts: ScaffoldTypstOptions = {}): string {
  const style = TYPST_BIB_STYLE[opts.citationStyle ?? "apa-7"];
  const title = opts.title?.trim() || "Judul Penelitian";

  const preamble = [
    '#set text(font: "Inter", lang: "id", size: 11pt)',
    "#set par(justify: true, leading: 0.8em, first-line-indent: 1.25em)",
    '#set page(paper: "a4", margin: (x: 3cm, y: 2.5cm), numbering: "1")',
    '#set heading(numbering: "1.1")',
    "",
  ].join("\n");

  const body: string[] = [preamble];
  if (THESIS_FAMILY.has(kind)) {
    body.push(titlePage(title, opts));
  } else if (kind !== "freeform" && (opts.title?.trim() || opts.authorName?.trim())) {
    body.push(
      `#align(center)[#text(size: 15pt, weight: "bold")[${escapeTypst(title)}]${
        opts.authorName?.trim() ? `\n\n  ${escapeTypst(opts.authorName.trim())}` : ""
      }]`,
      "",
    );
  }

  for (const heading of SCAFFOLD_HEADINGS[kind]) {
    body.push(`= ${heading}`, "");
  }

  if (kind !== "freeform") {
    body.push(`#bibliography("refs.bib", title: "Daftar Pustaka", style: "${style}")`, "");
  }

  return body.join("\n");
}

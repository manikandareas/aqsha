import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AppError } from "@aqsha/db";
import { PDFDocument } from "pdf-lib";
import { buildBibliographyFile } from "../src/citations/citation-bib";
import type { CslItem } from "../src/citations/citation-normalize";
import { LatexCompileService } from "../src/latex/compile.service";
import type { LatexCompileResult } from "../src/latex/compile.service";
import { parseSynctex, synctexInverseLookup } from "../src/latex/synctex";

const hasToolchain =
  Bun.which("tectonic") !== null &&
  (Bun.which("tectonic-biber") !== null || Bun.which("biber") !== null);
const itest = hasToolchain ? test : test.skip;

const PIXEL_PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

const LIBRARY: Array<{ id: string; csl: CslItem }> = [
  {
    id: "cit-1",
    csl: {
      type: "book",
      title: "Metode Penelitian Kuantitatif, Kualitatif, dan R&D",
      author: [{ family: "Sugiyono", given: "Andi" }],
      issued: { "date-parts": [[2019]] },
      publisher: "Alfabeta",
    },
  },
  {
    id: "cit-2",
    csl: {
      type: "book",
      title: "Research Design: Qualitative, Quantitative, and Mixed Methods Approaches",
      author: [
        { family: "Creswell", given: "John W." },
        { family: "Creswell", given: "J. David" },
      ],
      issued: { "date-parts": [[2018]] },
      publisher: "SAGE",
    },
  },
  {
    id: "cit-3",
    csl: {
      type: "article-journal",
      title: "Pendekatan Campuran dalam Penelitian Pendidikan",
      author: [{ family: "Nurhaliza", given: "Siti" }],
      issued: { "date-parts": [[2021]] },
      "container-title": "Jurnal Ilmu Pendidikan",
      volume: "27",
      page: "101-115",
    },
  },
];

function buildGateDoc(keys: Record<string, string>): { tex: string; citeLine: number } {
  const lines = [
    "\\documentclass{article}",
    "\\usepackage{amsmath}",
    "\\usepackage{graphicx}",
    "\\usepackage[backend=biber,style=authoryear]{biblatex}",
    "\\addbibresource{refs.bib}",
    "\\begin{document}",
    "\\section{Pendahuluan}",
    `Metode penelitian kualitatif \\cite{${keys["cit-1"]}} berkembang \\cite{${keys["cit-2"]}}.`,
    "\\begin{equation}",
    "  E = mc^2",
    "\\end{equation}",
    "\\includegraphics[width=2cm]{pixel.png}",
    `Pendekatan campuran juga dipakai \\cite{${keys["cit-3"]}}.`,
    "\\newpage",
    "\\printbibliography",
    "\\end{document}",
  ];
  return { tex: lines.join("\n"), citeLine: 8 };
}

let gateRun: Promise<{
  keyById: Record<string, string>;
  citeLine: number;
  result: LatexCompileResult;
}> | null = null;

function compileGateDoc() {
  gateRun ??= (async () => {
    const { bib, keyById } = buildBibliographyFile(LIBRARY);
    const { tex, citeLine } = buildGateDoc(keyById);
    const result = await LatexCompileService.compile({
      mainTex: tex,
      bib,
      extraFiles: { "pixel.png": PIXEL_PNG },
    });
    return { keyById, citeLine, result };
  })();
  return gateRun;
}

describe("GATE Fase 4: pipeline compile LaTeX + sitasi", () => {
  itest(
    "kriteria 1 & 4: PDF non-kosong, 2 halaman, selesai dalam timeout default",
    async () => {
      const { result } = await compileGateDoc();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.pdf.byteLength).toBeGreaterThan(5000);
      const doc = await PDFDocument.load(result.pdf);
      expect(doc.getPageCount()).toBe(2);
    },
    180_000,
  );

  itest(
    "kriteria 2: biber jalan — .bbl memuat semua entri tersitasi, tanpa sitasi undefined",
    async () => {
      const { result, keyById } = await compileGateDoc();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const bbl = result.intermediates["main.bbl"] ?? "";
      for (const key of Object.values(keyById)) {
        expect(bbl).toContain(key);
      }
      expect(result.log).not.toMatch(/Citation .* undefined/);
      expect(result.log).not.toMatch(/Empty bibliography/);
    },
    180_000,
  );

  itest(
    "kriteria 3: SyncTeX ada dan inverse-map kembali ke baris sumber yang benar",
    async () => {
      const { result, citeLine } = await compileGateDoc();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.synctex).not.toBeNull();
      if (!result.synctex) return;
      const data = parseSynctex(result.synctex);
      const mainTags = new Set(
        [...data.inputs.entries()]
          .filter(([, p]) => p.endsWith("main.tex"))
          .map(([tag]) => tag),
      );
      const anchor = data.records.find(
        (r) => r.page === 1 && mainTags.has(r.tag) && Math.abs(r.line - citeLine) <= 1,
      );
      expect(anchor).toBeDefined();
      if (!anchor) return;
      const found = synctexInverseLookup(data, {
        page: 1,
        x: anchor.x + 1000,
        y: anchor.y,
      });
      expect(found?.file.endsWith("main.tex")).toBe(true);
      expect(Math.abs((found?.line ?? 0) - citeLine)).toBeLessThanOrEqual(2);
    },
    180_000,
  );

  itest(
    "kriteria 5: \\write18 TIDAK dieksekusi",
    async () => {
      const marker = join(tmpdir(), `aqsha-gate-write18-${process.pid}`);
      await rm(marker, { force: true });
      await LatexCompileService.compile({
        mainTex: [
          "\\documentclass{article}",
          "\\begin{document}",
          `\\immediate\\write18{touch ${marker}}`,
          "aman",
          "\\end{document}",
        ].join("\n"),
      });
      expect(existsSync(marker)).toBe(false);
    },
    120_000,
  );

  itest(
    "kriteria 6: error LaTeX → errors[] terstruktur (line + pesan), bukan crash",
    async () => {
      const result = await LatexCompileService.compile({
        mainTex: [
          "\\documentclass{article}",
          "\\begin{document}",
          "\\undefinedmacro",
          "\\end{document}",
        ].join("\n"),
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors[0]?.line).toBe(3);
      expect(result.errors[0]?.message).toContain("Undefined control sequence");
    },
    120_000,
  );
});

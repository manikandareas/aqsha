import { describe, expect, test } from "bun:test";
import { convertLatexToDocx, isPandocAvailable } from "../src/latex/docx-convert";

const pandoc = await isPandocAvailable();
const maybe = pandoc ? test : test.skip;

const SAMPLE_MAIN = [
  "\\documentclass[12pt]{report}",
  "\\usepackage[backend=biber,style=apa]{biblatex}",
  "\\addbibresource{refs.bib}",
  "\\title{Uji Ekspor}",
  "\\author{Aqsha}",
  "\\begin{document}",
  "\\maketitle",
  "\\chapter{Pendahuluan}",
  "\\input{sections/intro.tex}",
  "\\printbibliography",
  "\\end{document}",
  "",
].join("\n");

describe("convertLatexToDocx", () => {
  maybe("menghasilkan byte .docx (zip PK) dari LaTeX + \\input", async () => {
    const docx = await convertLatexToDocx({
      mainTex: SAMPLE_MAIN,
      bib: "",
      extraFiles: {
        "sections/intro.tex": new TextEncoder().encode(
          "Ini paragraf pembuka untuk pengujian ekspor.\n",
        ),
      },
    });
    expect(docx.byteLength).toBeGreaterThan(0);
    // Magic bytes DOCX = arsip ZIP: 0x50 0x4B ("PK").
    expect(docx[0]).toBe(0x50);
    expect(docx[1]).toBe(0x4b);
  });

  test("isPandocAvailable mengembalikan boolean tanpa throw", async () => {
    expect(typeof (await isPandocAvailable())).toBe("boolean");
  });
});

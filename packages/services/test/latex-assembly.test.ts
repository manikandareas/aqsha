import { describe, expect, test } from "bun:test";
import {
  assembleSection,
  assembleWorkspace,
  buildPreamble,
  escapeLatex,
  sectionFilePath,
} from "../src/latex/assembly.service";

const decoder = new TextDecoder();
const PROJECT = {
  title: "Analisis A & B",
  author: "Vito",
  kind: "undergraduate_thesis",
  styleId: "apa-7",
};

describe("escapeLatex", () => {
  test("meng-escape karakter spesial TeX", () => {
    expect(escapeLatex("A & B_50% #1 $x$ {y} ~z^ \\w")).toBe(
      "A \\& B\\_50\\% \\#1 \\$x\\$ \\{y\\} \\textasciitilde{}z\\textasciicircum{} \\textbackslash{}w",
    );
  });
});

describe("buildPreamble", () => {
  test("thesis kind → report; style biblatex ter-mapping; judul di-escape", () => {
    const p = buildPreamble(PROJECT);
    expect(p).toContain("\\documentclass[12pt]{report}");
    expect(p).toContain("style=apa");
    expect(p).toContain("\\addbibresource{refs.bib}");
    expect(p).toContain("Analisis A \\& B");
  });

  test("kind non-thesis → article; style tak dikenal → authoryear", () => {
    const p = buildPreamble({ ...PROJECT, kind: "journal_article", styleId: "aneh" });
    expect(p).toContain("\\documentclass[12pt]{article}");
    expect(p).toContain("style=authoryear");
  });

  test("ieee → numeric-compatible mapping ieee; vancouver → numeric", () => {
    expect(buildPreamble({ ...PROJECT, styleId: "ieee" })).toContain("style=ieee");
    expect(buildPreamble({ ...PROJECT, styleId: "vancouver" })).toContain("style=numeric");
  });
});

describe("assembleSection", () => {
  test("body verbatim di file terpisah; heading+setcounter di mainTex", () => {
    const source = "Baris pertama.\nBaris kedua \\cite{a}.";
    const { mainTex, extraFiles } = assembleSection(PROJECT, {
      id: "sec-1",
      title: "Pendahuluan & Latar",
      sortOrder: 2,
      role: null,
      source,
    });
    const filePath = sectionFilePath("sec-1");
    // File bab = sumber user apa adanya → baris N file = baris N sumber (SyncTeX bersih).
    expect(decoder.decode(extraFiles[filePath])).toBe(source);
    expect(mainTex).toContain(`\\setcounter{chapter}{2}`);
    expect(mainTex).toContain("\\chapter{Pendahuluan \\& Latar}");
    expect(mainTex).toContain(`\\input{${filePath}}`);
    expect(mainTex).toContain("\\printbibliography");
  });
});

describe("assembleWorkspace", () => {
  const sections = [
    { id: "s2", title: "Bab 2", sortOrder: 1, role: null, source: "Isi bab dua." },
    { id: "s1", title: "Bab 1", sortOrder: 0, role: null, source: "Isi bab satu." },
    { id: "sbib", title: "Daftar Pustaka", sortOrder: 2, role: "bibliography", source: null },
    { id: "skosong", title: "Bab Kosong", sortOrder: 3, role: null, source: null },
  ];

  test("urut sortOrder; bibliography → \\printbibliography di posisinya; bab kosong dilewati", () => {
    const { mainTex, extraFiles } = assembleWorkspace(PROJECT, sections);
    const i1 = mainTex.indexOf("\\chapter{Bab 1}");
    const i2 = mainTex.indexOf("\\chapter{Bab 2}");
    const ibib = mainTex.indexOf("\\printbibliography");
    expect(i1).toBeGreaterThan(-1);
    expect(i1).toBeLessThan(i2);
    expect(i2).toBeLessThan(ibib);
    expect(mainTex).toContain("\\maketitle");
    expect(mainTex).not.toContain("Bab Kosong");
    expect(Object.keys(extraFiles).sort()).toEqual(["sections/s1.tex", "sections/s2.tex"]);
  });

  test("tanpa section bibliography → \\printbibliography fallback di akhir", () => {
    const { mainTex } = assembleWorkspace(PROJECT, sections.slice(0, 2));
    expect(mainTex).toContain("\\printbibliography");
  });
});

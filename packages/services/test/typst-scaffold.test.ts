import { describe, expect, test } from "bun:test";
import type { WorkspaceKind } from "@aqsha/db";
import { scanTypstCiteKeys } from "../src/typst/cite-scan";
import { TypstCompileService, isTypstAvailable } from "../src/typst/compile.service";
import { scaffoldTypstDocument } from "../src/typst/scaffold";

const ALL_KINDS: WorkspaceKind[] = [
  "undergraduate_thesis",
  "masters_thesis",
  "dissertation",
  "journal_article",
  "proposal",
  "paper",
  "freeform",
];

describe("scaffoldTypstDocument", () => {
  test("thesis-family: halaman judul (field terisi) + heading + bibliography", () => {
    const src = scaffoldTypstDocument("undergraduate_thesis", {
      title: "Analisis X",
      authorName: "Budi Santoso",
      year: 2026,
      kindInfo: { university: "Universitas A", faculty: "Fakultas B", studyProgram: "Prodi C" },
    });
    expect(src).toContain('#text(size: 18pt, weight: "bold")[Analisis X]');
    expect(src).toContain("Budi Santoso");
    expect(src).toContain("Prodi C");
    expect(src).toContain("Universitas A");
    expect(src).toContain("2026");
    expect(src).toContain("#pagebreak()");
    expect(src).toContain("= Pendahuluan");
    expect(src).toContain('#bibliography("refs.bib"');
  });

  test("field kosong dilewati rapi di halaman judul", () => {
    const src = scaffoldTypstDocument("masters_thesis", {
      title: "Judul",
      authorName: "Ani",
      kindInfo: { university: "Univ" }, // faculty & studyProgram kosong
    });
    expect(src).toContain("Ani");
    expect(src).toContain("Univ");
    expect(src).not.toContain("undefined");
    expect(src).not.toContain("null");
  });

  test("freeform: tanpa heading, tanpa bibliography, tanpa halaman judul", () => {
    const src = scaffoldTypstDocument("freeform", { title: "Bebas" });
    expect(src).not.toContain("#bibliography");
    expect(src).not.toContain("#pagebreak()");
    expect(src).not.toMatch(/^= /m);
    expect(src).toContain("#set text");
  });

  test("journal_article: heading IMRaD + bibliography, tanpa halaman judul thesis", () => {
    const src = scaffoldTypstDocument("journal_article", { title: "Paper" });
    for (const h of ["= Pendahuluan", "= Metode", "= Hasil", "= Pembahasan", "= Kesimpulan"]) {
      expect(src).toContain(h);
    }
    expect(src).toContain("#bibliography");
    expect(src).not.toContain("#pagebreak()");
  });

  test("gaya sitasi dipetakan ke nama style Typst", () => {
    expect(scaffoldTypstDocument("paper", { citationStyle: "apa-7" })).toContain(
      'style: "american-psychological-association"',
    );
    expect(scaffoldTypstDocument("paper", { citationStyle: "ieee" })).toContain('style: "ieee"');
    expect(scaffoldTypstDocument("paper", { citationStyle: "vancouver" })).toContain(
      'style: "nlm-citation-sequence"',
    );
  });

  test("teks pengguna di-escape (mencegah injeksi markup)", () => {
    const src = scaffoldTypstDocument("undergraduate_thesis", { title: "Judul #dengan* _spesial_" });
    expect(src).toContain("Judul \\#dengan\\* \\_spesial\\_");
  });

  const typst = isTypstAvailable();
  test("semua kind menghasilkan Typst yang compile", async () => {
    if (!(await typst)) return; // auto-skip tanpa binary
    for (const kind of ALL_KINDS) {
      const src = scaffoldTypstDocument(kind, {
        title: "Uji",
        authorName: "A",
        year: 2026,
        kindInfo: { university: "U", faculty: "F", studyProgram: "P", courseOrVenue: "V", affiliation: "Aff", targetJournal: "J" },
      });
      const result = await TypstCompileService.compile({ mainTyp: src, bib: "" });
      expect(result.ok).toBe(true);
    }
  });
});

describe("scanTypstCiteKeys", () => {
  test("@key shorthand + #cite(<key>), urutan kemunculan + duplikat", () => {
    const src = "Menurut @sugiyono2019 dan @miles1994, lalu #cite(<sugiyono2019>).";
    expect(scanTypstCiteKeys(src)).toEqual(["sugiyono2019", "miles1994", "sugiyono2019"]);
  });

  test("email a@b.com tidak dianggap sitasi", () => {
    expect(scanTypstCiteKeys("Kontak budi@example.com untuk info.")).toEqual([]);
  });

  test("trailing period dibuang; komentar diabaikan", () => {
    expect(scanTypstCiteKeys("Lihat @smith2020.\n// @commented2021\nAkhir.")).toEqual(["smith2020"]);
  });

  test("tanpa sitasi → array kosong", () => {
    expect(scanTypstCiteKeys("Teks biasa tanpa sitasi.")).toEqual([]);
  });
});

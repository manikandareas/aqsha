import { describe, expect, test } from "bun:test";
import {
  applyOutlineOperations,
  findOutlineSectionByTitle,
  parseTypstOutline,
  sliceOutlineSection,
} from "../src/typst/outline";

const SOURCE = [
  '#set page(numbering: "1")',
  "",
  "= Pendahuluan",
  "",
  "Latar belakang penelitian ini adalah lima kata.",
  "",
  "== Rumusan Masalah",
  "",
  "Satu dua tiga.",
  "",
  "= Metode Penelitian",
  "",
  "= Hasil",
  "",
  "Ada isi di sini.",
].join("\n");

describe("parseTypstOutline", () => {
  test("membaca level, baris, dan jumlah kata subtree", () => {
    const outline = parseTypstOutline(SOURCE);
    expect(outline).toHaveLength(4);
    expect(outline[0]).toEqual({
      index: 0,
      chapterIndex: 0,
      level: 1,
      title: "Pendahuluan",
      line: 3,
      words: 10,
      isEmpty: false,
    });
    expect(outline[1]).toEqual({
      index: 1,
      chapterIndex: null,
      level: 2,
      title: "Rumusan Masalah",
      line: 7,
      words: 3,
      isEmpty: false,
    });
  });

  test("menandai bab tanpa isi sebagai kosong", () => {
    const outline = parseTypstOutline(SOURCE);
    expect(outline[2]).toMatchObject({ title: "Metode Penelitian", words: 0, isEmpty: true });
    expect(outline[3]).toMatchObject({ title: "Hasil", words: 4, isEmpty: false });
  });

  test("mengabaikan heading di dalam komentar baris", () => {
    expect(parseTypstOutline("// = Bukan bab\n= Bab")).toHaveLength(1);
  });
});

describe("sliceOutlineSection", () => {
  test("memotong satu bab beserta rentang barisnya", () => {
    const section = sliceOutlineSection(SOURCE, 2);
    expect(section).toEqual({
      index: 2,
      title: "Metode Penelitian",
      level: 1,
      startLine: 11,
      endLine: 12,
      text: "= Metode Penelitian\n",
    });
  });

  test("memotong subbab sampai heading selevel berikutnya", () => {
    expect(sliceOutlineSection(SOURCE, 1)?.text).toBe("== Rumusan Masalah\n\nSatu dua tiga.\n");
  });

  test("mengembalikan null untuk indeks di luar jangkauan", () => {
    expect(sliceOutlineSection(SOURCE, 9)).toBeNull();
  });
});

describe("findOutlineSectionByTitle", () => {
  test("cocok tanpa peduli huruf besar dan spasi berlebih", () => {
    expect(findOutlineSectionByTitle(SOURCE, "  metode   penelitian ")?.index).toBe(2);
  });

  test("mengembalikan null bila judul tak ada", () => {
    expect(findOutlineSectionByTitle(SOURCE, "Simpulan")).toBeNull();
  });
});

describe("applyOutlineOperations", () => {
  test("mengganti nama bab tanpa menyentuh isinya", () => {
    const next = applyOutlineOperations(SOURCE, [
      { op: "rename", chapterIndex: 1, title: "Metode" },
    ]);
    expect(next.split("\n")[10]).toBe("= Metode");
    expect(next).toContain("Satu dua tiga.");
  });

  test("menghapus bab beserta subbabnya", () => {
    const next = applyOutlineOperations(SOURCE, [{ op: "remove", chapterIndex: 0 }]);
    expect(next).not.toContain("Rumusan Masalah");
    expect(next).toContain("= Metode Penelitian");
    expect(next.startsWith('#set page(numbering: "1")')).toBe(true);
  });

  test("menyisipkan bab baru sesudah bab yang ditunjuk", () => {
    const next = applyOutlineOperations(SOURCE, [
      { op: "insert", afterChapterIndex: 0, title: "Tinjauan Pustaka" },
    ]);
    const chapters = parseTypstOutline(next)
      .filter((h) => h.level === 1)
      .map((h) => h.title);
    expect(chapters).toEqual(["Pendahuluan", "Tinjauan Pustaka", "Metode Penelitian", "Hasil"]);
  });

  test("menyisipkan di akhir dokumen saat afterChapterIndex null", () => {
    const next = applyOutlineOperations(SOURCE, [
      { op: "insert", afterChapterIndex: null, title: "Simpulan" },
    ]);
    const chapters = parseTypstOutline(next)
      .filter((h) => h.level === 1)
      .map((h) => h.title);
    expect(chapters[chapters.length - 1]).toBe("Simpulan");
  });

  test("memindahkan bab beserta isinya", () => {
    const next = applyOutlineOperations(SOURCE, [
      { op: "move", chapterIndex: 2, toChapterIndex: 0 },
    ]);
    const chapters = parseTypstOutline(next)
      .filter((h) => h.level === 1)
      .map((h) => h.title);
    expect(chapters).toEqual(["Hasil", "Pendahuluan", "Metode Penelitian"]);
    expect(next).toContain("Ada isi di sini.");
  });

  test("menolak operasi pada indeks bab yang tak ada", () => {
    expect(() => applyOutlineOperations(SOURCE, [{ op: "remove", chapterIndex: 7 }])).toThrow(
      "Bab tidak ditemukan",
    );
  });

  test("menerapkan operasi berurutan atas hasil operasi sebelumnya", () => {
    const next = applyOutlineOperations(SOURCE, [
      { op: "remove", chapterIndex: 0 },
      { op: "rename", chapterIndex: 0, title: "Metodologi" },
    ]);
    expect(parseTypstOutline(next)[0]).toMatchObject({ title: "Metodologi", level: 1 });
  });
});

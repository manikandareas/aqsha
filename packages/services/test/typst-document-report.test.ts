import { describe, expect, test } from "bun:test";
import { inspectDocumentSource } from "../src/typst/document-report";

const SOURCE = [
  "= Pendahuluan",
  "",
  "Menurut @smith2020 hasilnya jelas, tapi @hantu2021 menyanggah.",
  "",
  "= Metode Penelitian",
  "",
  "= Pendahuluan",
  "",
  "Duplikat judul.",
].join("\n");

describe("inspectDocumentSource", () => {
  test("mengumpulkan sitasi yatim", () => {
    expect(inspectDocumentSource(SOURCE, ["smith2020"]).orphanCiteKeys).toEqual(["hantu2021"]);
  });

  test("mengumpulkan referensi yang tak pernah disitasi", () => {
    expect(inspectDocumentSource(SOURCE, ["smith2020", "lee2019"]).unusedReferenceKeys).toEqual([
      "lee2019",
    ]);
  });

  test("menandai bab tanpa isi", () => {
    expect(inspectDocumentSource(SOURCE, []).emptyHeadings).toEqual([
      { index: 1, title: "Metode Penelitian", line: 5 },
    ]);
  });

  test("menandai judul bab yang kembar", () => {
    expect(inspectDocumentSource(SOURCE, []).duplicateHeadings).toEqual(["Pendahuluan"]);
  });

  test("dokumen sehat tak melaporkan apa pun", () => {
    const clean = "= Bab\n\nIsi @a lengkap.";
    expect(inspectDocumentSource(clean, ["a"])).toEqual({
      orphanCiteKeys: [],
      unusedReferenceKeys: [],
      emptyHeadings: [],
      duplicateHeadings: [],
    });
  });
});

import { describe, expect, test } from "vitest";
import {
  type CitationExportFormat,
  exportBlobType,
  exportFileExtension,
  exportFileName,
  resolveExportContent,
} from "./export-model";

describe("resolveExportContent", () => {
  test("bibtex/ris: string mentah dari Eden dikembalikan apa adanya", async () => {
    const bibtex = "@article{smith2020,\n  title = {A Study},\n}\n";
    expect(await resolveExportContent(bibtex)).toBe(bibtex);

    const ris = "TY  - JOUR\nAU  - Smith, J.\nER  -\n";
    expect(await resolveExportContent(ris)).toBe(ris);
  });

  test("csl-json: array hasil auto-parse Eden distringifikasi (regresi bug unduh)", async () => {
    // Eden mem-parse `application/json` menjadi array — bentuk yang dulu jatuh ke
    // cabang Response.text() dan melempar TypeError sebelum blob dibuat.
    const parsed = [
      { id: "smith2020", type: "article-journal", title: "A Study", DOI: "10.1/x" },
      { id: "doe2021", type: "book", title: "A Book" },
    ];
    const content = await resolveExportContent(parsed);
    expect(typeof content).toBe("string");
    // Konten identik dengan payload server: round-trip harus mengembalikan array asli.
    expect(JSON.parse(content)).toEqual(parsed);
  });

  test("csl-json: objek tunggal hasil parse juga distringifikasi", async () => {
    const parsed = { id: "solo", type: "webpage", title: "Solo" };
    expect(JSON.parse(await resolveExportContent(parsed))).toEqual(parsed);
  });

  test("Response mentah tetap ditangani via .text()", async () => {
    const body = "TY  - JOUR\nER  -\n";
    expect(await resolveExportContent(new Response(body))).toBe(body);
  });
});

describe("export filename & blob type per format", () => {
  const cases: Array<[CitationExportFormat, string, string]> = [
    ["bibtex", "bib", "text/plain;charset=utf-8"],
    ["ris", "ris", "text/plain;charset=utf-8"],
    ["csl-json", "json", "application/json;charset=utf-8"],
  ];

  test.each(cases)("%s → ekstensi & mime", (format, ext, mime) => {
    expect(exportFileExtension(format)).toBe(ext);
    expect(exportFileName(format)).toBe(`sitasi.${ext}`);
    expect(exportBlobType(format)).toBe(mime);
  });
});

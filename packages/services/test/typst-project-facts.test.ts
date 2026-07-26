import { describe, expect, test } from "bun:test";
import { parseTypstOutline } from "../src/typst/outline";
import { citeIntegrity, type ProjectFacts, renderProjectManifest } from "../src/typst/project-facts";

const SOURCE = [
  "= Pendahuluan",
  "",
  "Menurut @smith2020 dan @hantu2021 hasilnya berbeda.",
  "",
  "= Metode Penelitian",
].join("\n");

function facts(overrides: Partial<ProjectFacts> = {}): ProjectFacts {
  return {
    workspaceId: "ws_1",
    workspaceName: "Skripsi Bias Seleksi",
    mainFileName: "skripsi.typ",
    contentVersion: 42,
    totalWords: 7,
    headings: parseTypstOutline(SOURCE),
    referenceCount: 2,
    orphanCiteKeys: ["hantu2021"],
    unusedReferenceKeys: ["lee2019"],
    openAnnotationCount: 2,
    pendingProposal: null,
    ...overrides,
  };
}

describe("citeIntegrity", () => {
  test("memisahkan sitasi yatim dari referensi menganggur", () => {
    expect(citeIntegrity(SOURCE, ["smith2020", "lee2019"])).toEqual({
      orphanCiteKeys: ["hantu2021"],
      unusedReferenceKeys: ["lee2019"],
    });
  });

  test("tidak menghitung duplikat sitasi dua kali", () => {
    expect(citeIntegrity("@a dan @a lagi", []).orphanCiteKeys).toEqual(["a"]);
  });

  test("bersih saat semua sitasi punya referensi", () => {
    expect(citeIntegrity("@a", ["a"])).toEqual({ orphanCiteKeys: [], unusedReferenceKeys: [] });
  });
});

describe("renderProjectManifest", () => {
  test("memuat identitas proyek dan versi dokumen", () => {
    const text = renderProjectManifest(facts());
    expect(text).toContain('Proyek aktif: "Skripsi Bias Seleksi" (workspaceId: ws_1)');
    expect(text).toContain("skripsi.typ");
    expect(text).toContain("contentVersion 42");
  });

  test("mencantumkan bab beserta jumlah kata dan penanda kosong", () => {
    const text = renderProjectManifest(facts());
    expect(text).toContain("1. = Pendahuluan (6 kata)");
    expect(text).toContain("2. = Metode Penelitian (kosong)");
  });

  test("melaporkan sitasi yatim dan referensi menganggur", () => {
    const text = renderProjectManifest(facts());
    expect(text).toContain("sitasi yatim: @hantu2021");
    expect(text).toContain("referensi menganggur: 1");
  });

  test("menyebut proposal tertunda saat ada", () => {
    const text = renderProjectManifest(
      facts({ pendingProposal: { id: "p_1", hunkCount: 3, isStale: false } }),
    );
    expect(text).toContain("Proposal tertunda: 3 bagian menunggu keputusan user");
  });

  test("menyatakan dokumen belum ditulis saat tak ada bab", () => {
    const text = renderProjectManifest(facts({ headings: [], totalWords: 0, contentVersion: 0 }));
    expect(text).toContain("Dokumen masih kosong");
  });

  test("dibungkus penanda system-reminder", () => {
    const text = renderProjectManifest(facts());
    expect(text.startsWith("<system-reminder>")).toBe(true);
    expect(text.trimEnd().endsWith("</system-reminder>")).toBe(true);
  });
});

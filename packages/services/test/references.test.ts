import { describe, expect, test } from "bun:test";
import {
  dedupeReferenceSources,
  formatApa7Reference,
  formatBibtex,
  formatRis,
  type ReferenceSourceInput,
  sortForReferenceList,
} from "../src/research/references";

function src(overrides: Partial<ReferenceSourceInput>): ReferenceSourceInput {
  return {
    citationNumber: null,
    origin: "doi",
    title: "Attention is all you need",
    locator: "10.5555/3295222",
    url: "https://doi.org/10.5555/3295222",
    doi: "10.5555/3295222",
    arxivId: null,
    authors: ["Ashish Vaswani", "Noam Shazeer"],
    year: 2017,
    venue: "Advances in Neural Information Processing Systems",
    ...overrides,
  };
}

describe("formatApa7Reference", () => {
  test("jurnal ber-DOI: penulis terbalik + tahun + venue italic + doi.org", () => {
    expect(formatApa7Reference(src({}))).toBe(
      "Vaswani, A., & Shazeer, N. (2017). Attention is all you need. " +
        "*Advances in Neural Information Processing Systems*. https://doi.org/10.5555/3295222",
    );
  });

  test("3 penulis tersimpan (kemungkinan ter-cap CTX-8) → et al.", () => {
    const out = formatApa7Reference(src({ authors: ["A Satu", "B Dua", "C Tiga"] }));
    expect(out).toContain("Satu, A., Dua, B., & Tiga, C., et al.");
  });

  test("tanpa tahun → (t.t.); tanpa penulis → mulai dari judul", () => {
    const out = formatApa7Reference(
      src({ authors: [], year: null, venue: null, doi: null, url: "https://contoh.id/a", locator: "https://contoh.id/a", origin: "web" }),
    );
    expect(out).toBe("(t.t.). Attention is all you need. https://contoh.id/a");
  });

  test("arXiv tanpa venue → label arXiv + tautan abs", () => {
    const out = formatApa7Reference(
      src({ doi: null, venue: null, arxivId: "1706.03762", url: null, locator: "1706.03762" }),
    );
    expect(out).toContain("arXiv.");
    expect(out).toContain("https://arxiv.org/abs/1706.03762");
  });

  test("nama tunggal (umum di Indonesia) tidak dipaksa berinisial", () => {
    expect(formatApa7Reference(src({ authors: ["Suharto"] }))).toStartWith("Suharto. (2017).");
  });
});

describe("dedupeReferenceSources", () => {
  test("DOI sama lintas turn → satu entri, metadata null diisi dari duplikat", () => {
    const a = src({ authors: [], year: null, citationNumber: 3 });
    const b = src({ authors: ["Ashish Vaswani"], year: 2017 });
    const out = dedupeReferenceSources([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0]!.citationNumber).toBe(3);
    expect(out[0]!.authors).toEqual(["Ashish Vaswani"]);
    expect(out[0]!.year).toBe(2017);
  });

  test("locator berbeda tanpa DOI → tetap dua entri", () => {
    const a = src({ doi: null, locator: "https://a.id", origin: "web" });
    const b = src({ doi: null, locator: "https://b.id", origin: "web" });
    expect(dedupeReferenceSources([a, b])).toHaveLength(2);
  });
});

describe("sortForReferenceList", () => {
  test("alfabetis nama keluarga penulis pertama, fallback judul", () => {
    const z = src({ authors: ["Zed Akhir"], title: "Zzz" });
    const a = src({ authors: [], title: "Awal tanpa penulis", doi: null, locator: "x" });
    const m = src({ authors: ["Budi Maulana"], title: "Mmm", doi: null, locator: "y" });
    const out = sortForReferenceList([z, m, a]);
    // Kunci: "akhir" (family Zed Akhir) < "awal tanpa penulis" (judul) < "maulana".
    expect(out.map((s) => s.title)).toEqual(["Zzz", "Awal tanpa penulis", "Mmm"]);
  });
});

describe("formatBibtex", () => {
  test("jurnal ber-DOI+venue → @article dengan author/journal/doi", () => {
    const out = formatBibtex([src({})]);
    expect(out).toStartWith("@article{vaswani2017attention,");
    expect(out).toContain("author = {Vaswani, Ashish and Shazeer, Noam}");
    expect(out).toContain("journal = {Advances in Neural Information Processing Systems}");
    expect(out).toContain("doi = {10.5555/3295222}");
  });

  test("3 penulis (kemungkinan ter-cap) → and others; kunci tabrakan diberi sufiks", () => {
    const a = src({ authors: ["A Satu", "B Dua", "C Tiga"] });
    const out = formatBibtex([a, a]);
    expect(out).toContain("and others");
    expect(out).toContain("@article{satu2017attention,");
    expect(out).toContain("@article{satu2017attentionb,");
  });

  test("web tanpa DOI → @misc dengan url", () => {
    const out = formatBibtex([
      src({ doi: null, venue: null, origin: "web", url: "https://contoh.id/a", locator: "https://contoh.id/a" }),
    ]);
    expect(out).toStartWith("@misc{");
    expect(out).toContain("url = {https://contoh.id/a}");
    expect(out).not.toContain("journal");
  });
});

describe("formatRis", () => {
  test("jurnal → TY JOUR + AU terbalik + DO + ER", () => {
    const out = formatRis([src({})]);
    expect(out).toStartWith("TY  - JOUR");
    expect(out).toContain("AU  - Vaswani, Ashish");
    expect(out).toContain("DO  - 10.5555/3295222");
    expect(out.trimEnd()).toEndWith("ER  -");
  });

  test("web → TY ELEC dengan UR", () => {
    const out = formatRis([
      src({ doi: null, venue: null, origin: "web", url: "https://contoh.id/a", locator: "https://contoh.id/a" }),
    ]);
    expect(out).toStartWith("TY  - ELEC");
    expect(out).toContain("UR  - https://contoh.id/a");
  });
});

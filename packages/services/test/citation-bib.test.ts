import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { CitationRepo } from "@aqsha/db";
import {
  buildBibliographyFile,
  composeBibliography,
  generateBibKeys,
  proposeBibKeys,
} from "../src/citations/citation-bib";
import type { CslItem } from "../src/citations/citation-normalize";
import { CitationService } from "../src/citations/citation.service";

afterEach(() => {
  mock.restore();
});

const book = (over: Record<string, unknown> = {}): CslItem => ({
  type: "book",
  title: "Metode Penelitian",
  author: [{ family: "Sugiyono", given: "Andi" }],
  issued: { "date-parts": [[2019]] },
  publisher: "Alfabeta",
  ...over,
});

describe("generateBibKeys", () => {
  test("kunci = family penulis pertama + tahun, lowercase alfanumerik", () => {
    expect(generateBibKeys([{ id: "c1", csl: book() }])).toEqual({ c1: "sugiyono2019" });
  });

  test("tabrakan → suffix a, b deterministik berdasar urutan id", () => {
    const keys = generateBibKeys([
      { id: "c2", csl: book() },
      { id: "c1", csl: book() },
      { id: "c3", csl: book() },
    ]);
    expect(keys.c1).toBe("sugiyono2019");
    expect(keys.c2).toBe("sugiyono2019a");
    expect(keys.c3).toBe("sugiyono2019b");
  });

  test("diakritik dibuang; non-alfanumerik dibuang", () => {
    const keys = generateBibKeys([
      { id: "c1", csl: book({ author: [{ family: "Çelik-Ö'Brien", given: "T." }] }) },
    ]);
    expect(keys.c1).toBe("celikobrien2019");
  });

  test("tanpa author → fallback 'ref'; tanpa tahun → tanpa angka", () => {
    const keys = generateBibKeys([
      { id: "c1", csl: { type: "webpage", title: "Anon" } },
      { id: "c2", csl: book({ author: [{ literal: "Badan Pusat Statistik" }] }) },
    ]);
    expect(keys.c1).toBe("ref");
    expect(keys.c2).toBe("badanpusatstatistik2019");
  });
});

describe("proposeBibKeys", () => {
  const csl = (family: string, year: number) => ({
    type: "book",
    title: "T",
    author: [{ family }],
    issued: { "date-parts": [[year]] },
  });

  test("menghormati taken set — kunci terpakai tak diberikan ulang", () => {
    const taken = new Set(["sugiyono2019"]);
    const keys = proposeBibKeys([{ id: "a", csl: csl("Sugiyono", 2019) }], taken);
    expect(keys.a).toBe("sugiyono2019a");
    expect(taken.has("sugiyono2019a")).toBe(true);
  });

  test("stabil: item lama tak bergeser saat item baru masuk belakangan", () => {
    const taken = new Set<string>();
    const first = proposeBibKeys([{ id: "a", csl: csl("Creswell", 2018) }], taken);
    const second = proposeBibKeys([{ id: "b", csl: csl("Creswell", 2018) }], taken);
    expect(first.a).toBe("creswell2018");
    expect(second.b).toBe("creswell2018a");
  });
});

describe("composeBibliography", () => {
  test("memakai kunci eksternal apa adanya", () => {
    const bib = composeBibliography([
      { key: "kuncicustom99", csl: { type: "book", title: "Judul", author: [{ family: "Penulis" }] } },
    ]);
    expect(bib).toMatch(/@\w+\{kuncicustom99,/);
  });
});

describe("buildBibliographyFile", () => {
  test("menghasilkan entri biblatex dengan kunci yang di-generate", () => {
    const { bib, keyById } = buildBibliographyFile([
      { id: "c1", csl: book() },
      {
        id: "c2",
        csl: {
          type: "article-journal",
          title: "Pendekatan Campuran",
          author: [{ family: "Nurhaliza", given: "Siti" }],
          issued: { "date-parts": [[2021]] },
          "container-title": "Jurnal Ilmu Pendidikan",
        },
      },
    ]);
    expect(keyById).toEqual({ c1: "sugiyono2019", c2: "nurhaliza2021" });
    expect(bib).toMatch(/@\w+\{sugiyono2019,/);
    expect(bib).toMatch(/@\w+\{nurhaliza2021,/);
    // citation-js melindungi case judul dengan kurung kurawal ({Metode {Penelitian}});
    // itu output biblatex yang benar — buang kurawal proteksi sebelum cek isi judul.
    expect(bib.replace(/[{}]/g, "")).toContain("Metode Penelitian");
  });

  test("himpunan kosong → bib kosong dan peta kosong (dokumen tanpa sitasi valid)", () => {
    expect(buildBibliographyFile([])).toEqual({ bib: "", keyById: {} });
  });
});

describe("CitationService.exportBib", () => {
  test("memetakan baris repo → bib + keyById (assign bib_key lazy)", async () => {
    const row = {
      id: "row-1",
      deletedAt: null,
      bibKey: null,
      cslJson: {
        type: "book",
        title: "Metode Penelitian",
        author: [{ family: "Sugiyono" }],
        issued: { "date-parts": [[2019]] },
      },
    };
    spyOn(CitationRepo, "listAllActive").mockResolvedValue([row] as never);
    // exportBib → ensureBibKeys: baca ulang via findByIds, cek taken, assign lazy.
    spyOn(CitationRepo, "findByIds").mockResolvedValue([row] as never);
    spyOn(CitationRepo, "listTakenBibKeys").mockResolvedValue([]);
    const updateById = spyOn(CitationRepo, "updateById").mockResolvedValue(undefined as never);
    const result = await CitationService.exportBib({} as never, { ownerUserId: "u1" });
    expect(result.keyById).toEqual({ "row-1": "sugiyono2019" });
    expect(result.bib).toMatch(/@\w+\{sugiyono2019,/);
    expect(updateById).toHaveBeenCalledWith({}, "row-1", expect.objectContaining({ bibKey: "sugiyono2019" }));
  });
});

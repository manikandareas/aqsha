import { describe, expect, test } from "bun:test";
import { applyHunkSelection, computeProposalHunks } from "../src/typst/hunks";

// Dua suntingan berjarak >2×context(3) baris supaya menjadi dua hunk terpisah.
const BASE = [
  "\\section{Pendahuluan}",
  "Kalimat pembuka lama.",
  "Baris tiga.",
  "Baris empat.",
  "Baris lima.",
  "Baris enam.",
  "Baris tujuh.",
  "Baris delapan.",
  "Baris sembilan.",
  "Baris sepuluh.",
  "Penutup lama.",
  "Baris akhir.",
].join("\n");
const PROPOSED = BASE.replace("Kalimat pembuka lama.", "Kalimat pembuka baru.").replace(
  "Penutup lama.",
  "Penutup baru.",
);

describe("computeProposalHunks", () => {
  test("sumber identik → tanpa hunk", () => {
    expect(computeProposalHunks(BASE, BASE)).toEqual([]);
  });

  test("dua suntingan berjauhan → dua hunk terindeks urut", () => {
    const hunks = computeProposalHunks(BASE, PROPOSED);
    expect(hunks.length).toBe(2);
    expect(hunks.map((h) => h.index)).toEqual([0, 1]);
    expect(hunks[0]!.oldStart).toBeLessThan(hunks[1]!.oldStart);
  });

  test("basis kosong (draf awal) → satu hunk penuh", () => {
    const hunks = computeProposalHunks("", "Baris satu.\nBaris dua.\n");
    expect(hunks.length).toBe(1);
    expect(applyHunkSelection("", hunks, new Set([0]))).toBe("Baris satu.\nBaris dua.\n");
  });
});

describe("applyHunkSelection", () => {
  const hunks = computeProposalHunks(BASE, PROPOSED);

  test("semua terpilih ≡ proposedSource; kosong ≡ baseSource", () => {
    expect(applyHunkSelection(BASE, hunks, new Set([0, 1]))).toBe(PROPOSED);
    expect(applyHunkSelection(BASE, hunks, new Set())).toBe(BASE);
  });

  test("subset → hanya hunk terpilih yang diterapkan", () => {
    const onlyFirst = BASE.replace("Kalimat pembuka lama.", "Kalimat pembuka baru.");
    const onlySecond = BASE.replace("Penutup lama.", "Penutup baru.");
    expect(applyHunkSelection(BASE, hunks, new Set([0]))).toBe(onlyFirst);
    expect(applyHunkSelection(BASE, hunks, new Set([1]))).toBe(onlySecond);
  });

  test("trailing newline dipertahankan persis (tambah & hapus)", () => {
    const noEol = "a\nb";
    const withEol = "a\nb\n";
    const addEol = computeProposalHunks(noEol, withEol);
    expect(applyHunkSelection(noEol, addEol, new Set(addEol.map((h) => h.index)))).toBe(withEol);
    const dropEol = computeProposalHunks(withEol, noEol);
    expect(applyHunkSelection(withEol, dropEol, new Set(dropEol.map((h) => h.index)))).toBe(noEol);
  });

  test("basis bukan basis diff → throw (guard bug internal)", () => {
    expect(() => applyHunkSelection("Sumber lain sama sekali.", hunks, new Set([0]))).toThrow();
  });
});

import { describe, expect, test } from "bun:test";
import { resolveHunkDecisions } from "../src/typst/hunks";

const BASE = [
  "= Bab Satu",
  "",
  "Alpha.",
  "",
  "= Bab Dua",
  "",
  "Beta.",
  "",
  "= Bab Tiga",
  "",
  "Gamma.",
].join("\n");
const PROPOSED = BASE.replace("Alpha.", "Alpha diperluas.").replace("Gamma.", "Gamma diperluas.");

describe("resolveHunkDecisions", () => {
  test("tanpa keputusan, seluruh hunk masih tersisa dan sumber tak berubah", () => {
    const r = resolveHunkDecisions(BASE, PROPOSED, {});
    expect(r.hunks).toHaveLength(2);
    expect(r.appliedSource).toBe(BASE);
    expect(r.remainingHunks).toHaveLength(2);
    expect(r.allDecided).toBe(false);
    expect(r.acceptedCount).toBe(0);
  });

  test("hunk yang diterima masuk ke sumber dan hilang dari sisa", () => {
    const r = resolveHunkDecisions(BASE, PROPOSED, { "0": "accepted" });
    expect(r.appliedSource).toContain("Alpha diperluas.");
    expect(r.appliedSource).toContain("Gamma.");
    expect(r.remainingHunks).toHaveLength(1);
    expect(r.acceptedCount).toBe(1);
  });

  test("hunk yang ditolak tidak mengubah sumber tapi tetap hilang dari sisa", () => {
    const r = resolveHunkDecisions(BASE, PROPOSED, { "0": "rejected" });
    expect(r.appliedSource).toBe(BASE);
    expect(r.remainingHunks).toHaveLength(1);
    expect(r.acceptedCount).toBe(0);
  });

  test("sisa hunk dianchor ke sumber tersimpan, bukan ke basis", () => {
    const r = resolveHunkDecisions(BASE, PROPOSED, { "0": "accepted" });
    const remaining = r.remainingHunks[0]!;
    const appliedLines = r.appliedSource.split("\n");
    expect(appliedLines[remaining.oldStart - 1]).toBeDefined();
    expect(remaining.lines.some((l) => l === "-Gamma.")).toBe(true);
    expect(remaining.lines.some((l) => l === "+Gamma diperluas.")).toBe(true);
  });

  test("semua diterima menghasilkan sumber usulan utuh", () => {
    const r = resolveHunkDecisions(BASE, PROPOSED, { "0": "accepted", "1": "accepted" });
    expect(r.appliedSource).toBe(PROPOSED);
    expect(r.remainingHunks).toHaveLength(0);
    expect(r.allDecided).toBe(true);
  });

  test("semua ditolak mengembalikan sumber basis dan menutup keputusan", () => {
    const r = resolveHunkDecisions(BASE, PROPOSED, { "0": "rejected", "1": "rejected" });
    expect(r.appliedSource).toBe(BASE);
    expect(r.allDecided).toBe(true);
    expect(r.acceptedCount).toBe(0);
  });

  test("keputusan campuran memakai target gabungan diterima dan belum diputuskan", () => {
    const r = resolveHunkDecisions(BASE, PROPOSED, { "1": "accepted" });
    expect(r.appliedSource).toContain("Gamma diperluas.");
    expect(r.targetSource).toBe(PROPOSED);
    expect(r.remainingHunks).toHaveLength(1);
  });
});

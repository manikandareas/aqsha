import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSynctex, synctexInverseLookup } from "../src/latex/synctex";

const FIXTURE = new Uint8Array(
  readFileSync(join(import.meta.dir, "fixtures/latex/sample.synctex.gz")),
);
// Baris di sample-main.tex (fixture Task 1): kalimat berisi \cite.
const CITE_LINE = 8;

describe("parseSynctex", () => {
  test("membaca preamble: unit, magnification, dan daftar input", () => {
    const data = parseSynctex(FIXTURE);
    expect(data.unit).toBeGreaterThan(0);
    expect(data.magnification).toBeGreaterThan(0);
    expect([...data.inputs.values()].some((p) => p.endsWith("main.tex"))).toBe(true);
  });

  test("mengekstrak record posisi ber-halaman", () => {
    const data = parseSynctex(FIXTURE);
    expect(data.records.length).toBeGreaterThan(50);
    expect(data.records.every((r) => r.page >= 1)).toBe(true);
    expect(data.records.some((r) => r.page === 2)).toBe(true);
  });

  test("ada record halaman 1 untuk baris kalimat \\cite di main.tex", () => {
    const data = parseSynctex(FIXTURE);
    const mainTags = new Set(
      [...data.inputs.entries()].filter(([, p]) => p.endsWith("main.tex")).map(([t]) => t),
    );
    const hit = data.records.find(
      (r) => r.page === 1 && mainTags.has(r.tag) && Math.abs(r.line - CITE_LINE) <= 1,
    );
    expect(hit).toBeDefined();
  });
});

describe("synctexInverseLookup", () => {
  test("koordinat sebuah record → kembali ke baris sumber yang sama", () => {
    const data = parseSynctex(FIXTURE);
    const mainTags = new Set(
      [...data.inputs.entries()].filter(([, p]) => p.endsWith("main.tex")).map(([t]) => t),
    );
    const anchor = data.records.find(
      (r) => r.page === 1 && mainTags.has(r.tag) && Math.abs(r.line - CITE_LINE) <= 1,
    );
    expect(anchor).toBeDefined();
    if (!anchor) return;
    const found = synctexInverseLookup(data, {
      page: 1,
      x: anchor.x + 1000,
      y: anchor.y,
    });
    expect(found).not.toBeNull();
    expect(found?.file.endsWith("main.tex")).toBe(true);
    expect(Math.abs((found?.line ?? 0) - CITE_LINE)).toBeLessThanOrEqual(2);
  });

  test("halaman tanpa record → null", () => {
    const data = parseSynctex(FIXTURE);
    expect(synctexInverseLookup(data, { page: 99, x: 0, y: 0 })).toBeNull();
  });
});

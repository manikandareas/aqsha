import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseSynctex,
  pdfPointToSp,
  spToPdfPoint,
  synctexForwardLookup,
  synctexInverseLookup,
  synctexInverseLookupPdfPoint,
} from "../src/latex/synctex";

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

describe("konversi koordinat sp ↔ PDF point", () => {
  test("round-trip pt → sp → pt stabil", () => {
    expect(spToPdfPoint(pdfPointToSp(100))).toBeCloseTo(100, 3);
    // 1 inch = 72 pt PDF = 72.27 pt TeX = 72.27*65536 sp.
    expect(pdfPointToSp(72)).toBeCloseTo(72.27 * 65536, -2);
  });
});

describe("synctexInverseLookupPdfPoint", () => {
  test("koordinat record (dikonversi ke pt) → baris sumber yang sama", () => {
    const data = parseSynctex(FIXTURE);
    const mainTags = new Set(
      [...data.inputs.entries()].filter(([, p]) => p.endsWith("main.tex")).map(([t]) => t),
    );
    const anchor = data.records.find(
      (r) => r.page === 1 && mainTags.has(r.tag) && Math.abs(r.line - CITE_LINE) <= 1,
    );
    expect(anchor).toBeDefined();
    if (!anchor) return;
    const found = synctexInverseLookupPdfPoint(data, {
      page: 1,
      xPt: spToPdfPoint(anchor.x * data.unit),
      yPt: spToPdfPoint(anchor.y * data.unit),
    });
    expect(found?.file.endsWith("main.tex")).toBe(true);
    expect(Math.abs((found?.line ?? 0) - CITE_LINE)).toBeLessThanOrEqual(2);
  });
});

describe("synctexForwardLookup", () => {
  test("file+baris \\cite → posisi halaman 1 dengan koordinat pt masuk akal", () => {
    const data = parseSynctex(FIXTURE);
    const hit = synctexForwardLookup(data, { file: "main.tex", line: CITE_LINE });
    expect(hit).not.toBeNull();
    expect(hit?.page).toBe(1);
    // Halaman A4 ≈ 595×842 pt — koordinat wajib dalam rentang halaman.
    expect(hit!.xPt).toBeGreaterThanOrEqual(0);
    expect(hit!.xPt).toBeLessThan(700);
    expect(hit!.yPt).toBeGreaterThanOrEqual(0);
    expect(hit!.yPt).toBeLessThan(900);
  });

  test("file tak dikenal / baris jauh → null atau baris terdekat masih di file itu", () => {
    const data = parseSynctex(FIXTURE);
    expect(synctexForwardLookup(data, { file: "tidak-ada.tex", line: 1 })).toBeNull();
  });
});

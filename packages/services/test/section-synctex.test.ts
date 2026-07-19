import { describe, expect, test } from "bun:test";
import type { SynctexData } from "../src/latex/synctex";
import { pickBodyLine, pickBodyPosition } from "../src/section-synctex.service";

// SynctexData minimal: satu input body + satu record.
function fakeData(bodyPath: string): SynctexData {
  return {
    unit: 1,
    magnification: 1000,
    xOffset: 0,
    yOffset: 0,
    inputs: new Map([
      [1, `/tmp/aqsha-latex-xxx/main.tex`],
      [2, `/tmp/aqsha-latex-xxx/${bodyPath}`],
    ]),
    records: [
      { kind: "x", tag: 1, line: 3, x: 100, y: 100, page: 1 },
      { kind: "x", tag: 2, line: 12, x: 5_000_000, y: 6_000_000, page: 2 },
    ],
  };
}

describe("section-synctex pemetaan body", () => {
  test("inverse hanya menerima hit ke file body bab", () => {
    const data = fakeData("sections/sec-1.tex");
    // Titik dekat record tag=2 (body) di page 2.
    const near = pickBodyLine(data, "sections/sec-1.tex", {
      page: 2,
      xPt: 5_000_000 / ((65536 * 72.27) / 72),
      yPt: 6_000_000 / ((65536 * 72.27) / 72),
    });
    expect(near).toEqual({ line: 12 });
  });

  test("inverse mengembalikan null saat titik terdekat bukan file body", () => {
    const data = fakeData("sections/sec-1.tex");
    const hit = pickBodyLine(data, "sections/sec-1.tex", { page: 1, xPt: 0.1, yPt: 0.1 });
    expect(hit).toBeNull(); // record page 1 hanya milik main.tex (tag 1)
  });

  test("forward memetakan baris body ke posisi PDF", () => {
    const data = fakeData("sections/sec-1.tex");
    const pos = pickBodyPosition(data, "sections/sec-1.tex", 12);
    expect(pos?.page).toBe(2);
    expect(pos?.xPt).toBeGreaterThan(0);
  });
});

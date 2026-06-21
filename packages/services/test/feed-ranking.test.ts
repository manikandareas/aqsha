import { describe, expect, test } from "bun:test";
import {
  deClump,
  interestMatch,
  kindBoost,
  popularityScore,
  reasonFor,
  recencyScore,
} from "../src/feed/ranking";

describe("interestMatch", () => {
  test("saturasi ~0..1 + topTopic weight tertinggi", () => {
    const w = new Map([
      ["machine learning", 4],
      ["climate", 1],
    ]);
    const r = interestMatch(["Machine Learning", "Climate"], w);
    expect(r.normalized).toBeCloseTo(5 / 9, 5); // total 5 → 5/(5+4)
    expect(r.topTopic).toBe("Machine Learning");
  });
  test("tanpa overlap → 0", () => {
    expect(interestMatch(["x"], new Map()).normalized).toBe(0);
  });
});

describe("recencyScore", () => {
  test("baru ≈1, lama menurun", () => {
    const now = 1_000_000_000_000;
    expect(recencyScore(now, now)).toBeCloseTo(1, 5);
    expect(recencyScore(now - 21 * 86_400_000, now)).toBeCloseTo(Math.exp(-1), 5);
  });
});

describe("popularityScore", () => {
  test("0 saat trendScore<=0, naik log10", () => {
    expect(popularityScore(0)).toBe(0);
    expect(popularityScore(99_999)).toBeCloseTo(Math.min(1, Math.log10(100_000) / 5), 5);
  });
});

describe("kindBoost", () => {
  test("non-paper di-nudge, paper 0", () => {
    expect(kindBoost("paper")).toBe(0);
    expect(kindBoost("claim")).toBe(0.25);
    expect(kindBoost("news")).toBe(0.15);
  });
});

describe("deClump", () => {
  test("sisipkan kind beda saat ada alternatif (greedy de-clump)", () => {
    const scored = [
      { item: { kind: "paper" }, score: 9 },
      { item: { kind: "paper" }, score: 8 },
      { item: { kind: "news" }, score: 7 },
      { item: { kind: "paper" }, score: 6 },
    ];
    const out = deClump(scored, 4);
    // paper#1 lalu news disisipkan (hindari 2 paper berturut selagi ada alternatif).
    expect(out.map((e) => e.item.kind)).toEqual(["paper", "news", "paper", "paper"]);
    expect(out.length).toBe(4); // tetap ambil semua sampai limit
  });
});

describe("reasonFor", () => {
  test("minat → topik; serendipity → bidang sebelah; fallback per kind", () => {
    expect(reasonFor({ kind: "paper", trendScore: 5 }, { topTopic: "ML" }, false)).toBe(
      "Karena minat: ML",
    );
    expect(reasonFor({ kind: "paper", trendScore: 5 }, {}, true)).toBe("Bidang bersebelahan");
    expect(reasonFor({ kind: "claim", trendScore: 0 }, {}, false)).toBe(
      "Klaim diperiksa pemeriksa fakta",
    );
  });
});

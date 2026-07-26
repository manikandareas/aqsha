import { describe, expect, test } from "bun:test";
import { interestMatch, popularityScore, recencyScore } from "../src/feed/ranking";

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


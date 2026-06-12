import { describe, expect, it } from "vitest";
import { normalizeArxivId, normalizeDoi } from "../src/lib/identifiers";
import { authorOverlap, titleSimilarity, tokenJaccard } from "../src/lib/similarity";
import { clipText, collapse, trimForSnippet } from "../src/lib/text";

describe("text helpers", () => {
  it("collapse squeezes whitespace", () => {
    expect(collapse("  a\n\tb   c ")).toBe("a b c");
  });

  it("clipText keeps short values and clips long ones with ellipsis", () => {
    expect(clipText("short text", 100)).toEqual({ text: "short text", clipped: false });
    const clipped = clipText("x".repeat(50), 10);
    expect(clipped.clipped).toBe(true);
    expect(clipped.text.endsWith("...")).toBe(true);
    expect(clipped.text.length).toBeLessThanOrEqual(10);
  });

  it("trimForSnippet collapses and bounds", () => {
    expect(trimForSnippet("  a  b  ")).toBe("a b");
    expect(trimForSnippet("y".repeat(800), 100).length).toBe(100);
  });
});

describe("identifiers", () => {
  it("normalizeDoi strips prefixes and lowercases", () => {
    expect(normalizeDoi("https://doi.org/10.1000/ABC")).toBe("10.1000/abc");
    expect(normalizeDoi("doi:10.1000/xyz")).toBe("10.1000/xyz");
    expect(normalizeDoi("  10.1000/xyz  ")).toBe("10.1000/xyz");
  });

  it("normalizeArxivId handles urls, prefixes, and versions", () => {
    expect(normalizeArxivId("arXiv:2403.01234v2")).toBe("2403.01234");
    expect(normalizeArxivId("https://arxiv.org/abs/1706.03762")).toBe("1706.03762");
    expect(normalizeArxivId("not an id")).toBeNull();
  });
});

describe("similarity", () => {
  it("titleSimilarity is 1 for identical and high for reordered titles", () => {
    expect(titleSimilarity("Attention Is All You Need", "Attention Is All You Need")).toBe(1);
    expect(
      titleSimilarity("Attention Is All You Need", "attention is all you need!"),
    ).toBe(1);
    expect(
      titleSimilarity("Deep learning for NLP", "NLP for deep learning"),
    ).toBeGreaterThan(0.5);
    expect(titleSimilarity("Completely different", "Unrelated paper title")).toBeLessThan(
      0.3,
    );
  });

  it("tokenJaccard handles empty inputs", () => {
    expect(tokenJaccard("", "")).toBe(1);
    expect(tokenJaccard("a b", "")).toBe(0);
  });

  it("authorOverlap matches last names in both name orders", () => {
    expect(
      authorOverlap(["Vaswani, A.", "Shazeer, N."], ["Ashish Vaswani", "Noam Shazeer"]),
    ).toBe(1);
    expect(authorOverlap(["Smith, J."], ["Ashish Vaswani"])).toBe(0);
    expect(authorOverlap(undefined, ["Anyone"])).toBe(1);
  });
});

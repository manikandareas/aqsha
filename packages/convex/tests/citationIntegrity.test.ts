import { describe, expect, it } from "vitest";
import {
  authorOverlap,
  levenshtein,
  titleSimilarity,
  tokenJaccard,
} from "../convex/lib/similarity";
import {
  classifyIntegrity,
  compareMetadata,
  type IntegritySignals,
} from "../convex/agent/research/citationIntegrity";

// Base signals = "nothing checked". Tests override only the relevant fields so
// each case reads as a single scenario.
function signals(overrides: Partial<IntegritySignals>): IntegritySignals {
  return {
    hasIdentifier: false,
    identifierResolved: null,
    identifierTitleMatch: null,
    existenceFound: null,
    metadataConsistent: null,
    metadataIssues: [],
    ...overrides,
  };
}

describe("similarity helpers", () => {
  it("levenshtein counts edits", () => {
    expect(levenshtein("kitten", "kitten")).toBe(0);
    expect(levenshtein("kitten", "sitten")).toBe(1);
    expect(levenshtein("", "abc")).toBe(3);
  });

  it("tokenJaccard is robust to word order", () => {
    expect(tokenJaccard("deep learning models", "models deep learning")).toBe(1);
    expect(tokenJaccard("a b c d", "a b")).toBeCloseTo(0.5, 5);
    expect(tokenJaccard("apples", "oranges")).toBe(0);
  });

  it("titleSimilarity: identical, reordered, and typo titles score high", () => {
    expect(titleSimilarity("Attention Is All You Need", "Attention Is All You Need")).toBe(1);
    // Full word reordering (rare for real citations) still clears the
    // identifier-match threshold (0.6) thanks to the token-set component.
    expect(
      titleSimilarity("Attention Is All You Need", "All You Need Is Attention"),
    ).toBeGreaterThan(0.6);
    // A single-character typo stays high — well above the 0.7 existence
    // threshold even though the mistyped word drops out of the token overlap.
    expect(
      titleSimilarity("Deep Residual Learning for Image Recognition", "Deep Residual Learning for Image Recogntion"),
    ).toBeGreaterThan(0.8);
  });

  it("titleSimilarity: unrelated titles score low", () => {
    expect(
      titleSimilarity("Attention Is All You Need", "A Theory of Justice in Markets"),
    ).toBeLessThan(0.3);
  });

  it("authorOverlap matches on last names and is empty-safe", () => {
    expect(authorOverlap(["Ashish Vaswani", "Noam Shazeer"], ["Vaswani, A.", "Shazeer, N."])).toBe(1);
    expect(authorOverlap(["Ashish Vaswani", "Jane Roe"], ["Vaswani, A."])).toBeCloseTo(0.5, 5);
    expect(authorOverlap(["Jane Roe"], ["Ashish Vaswani"])).toBe(0);
    // No cited authors → no constraint to violate.
    expect(authorOverlap(undefined, ["Vaswani"])).toBe(1);
    expect(authorOverlap([], [])).toBe(1);
  });
});

describe("classifyIntegrity — golden verdict table", () => {
  it("verified: identifier resolves, title matches, metadata consistent", () => {
    expect(
      classifyIntegrity(
        signals({
          hasIdentifier: true,
          identifierResolved: true,
          identifierTitleMatch: true,
          metadataConsistent: true,
        }),
      ),
    ).toBe("verified");
  });

  it("identifier_invalid: a present DOI does not resolve", () => {
    expect(
      classifyIntegrity(signals({ hasIdentifier: true, identifierResolved: false })),
    ).toBe("identifier_invalid");
  });

  it("identifier_invalid: identifier resolves to a different title", () => {
    expect(
      classifyIntegrity(
        signals({
          hasIdentifier: true,
          identifierResolved: true,
          identifierTitleMatch: false,
        }),
      ),
    ).toBe("identifier_invalid");
  });

  it("metadata_mismatch: identifier resolves + title matches but metadata diverges", () => {
    expect(
      classifyIntegrity(
        signals({
          hasIdentifier: true,
          identifierResolved: true,
          identifierTitleMatch: true,
          metadataConsistent: false,
        }),
      ),
    ).toBe("metadata_mismatch");
  });

  it("verified via existence: no identifier, work found, metadata consistent", () => {
    expect(
      classifyIntegrity(signals({ existenceFound: true, metadataConsistent: true })),
    ).toBe("verified");
  });

  it("metadata_mismatch via existence: work found but metadata diverges", () => {
    expect(
      classifyIntegrity(signals({ existenceFound: true, metadataConsistent: false })),
    ).toBe("metadata_mismatch");
  });

  it("not_found: searched, no matching work (the fabricated-citation case)", () => {
    expect(classifyIntegrity(signals({ existenceFound: false }))).toBe("not_found");
  });

  it("unverifiable: nothing could be checked (all providers errored)", () => {
    expect(classifyIntegrity(signals({}))).toBe("unverifiable");
  });

  it("conservative: an unresolvable identifier falls back to existence (no false accusation)", () => {
    // DOI lookup hit a transient failure (identifierResolved stays null) but the
    // work exists in OpenAlex → verified, NOT identifier_invalid.
    expect(
      classifyIntegrity(
        signals({ hasIdentifier: true, existenceFound: true, metadataConsistent: true }),
      ),
    ).toBe("verified");
    // Unresolvable identifier + work not found → not_found.
    expect(
      classifyIntegrity(signals({ hasIdentifier: true, existenceFound: false })),
    ).toBe("not_found");
  });
});

describe("compareMetadata", () => {
  it("consistent when fields agree (year within tolerance)", () => {
    expect(
      compareMetadata(
        { authors: ["Vaswani"], year: 2017, venue: "NeurIPS" },
        { authors: ["Vaswani, A.", "Shazeer, N."], year: 2018, venue: "NeurIPS" },
      ).consistent,
    ).toBe(true);
  });

  it("flags a year off by more than the tolerance", () => {
    const cmp = compareMetadata({ year: 2017 }, { year: 2010 });
    expect(cmp.consistent).toBe(false);
    expect(cmp.issues.join(" ")).toContain("year");
  });

  it("flags an author mismatch", () => {
    const cmp = compareMetadata({ authors: ["Roe", "Doe"] }, { authors: ["Vaswani", "Shazeer"] });
    expect(cmp.consistent).toBe(false);
    expect(cmp.issues).toContain("author mismatch");
  });

  it("flags a venue mismatch", () => {
    const cmp = compareMetadata({ venue: "Nature" }, { venue: "Journal of Marketing" });
    expect(cmp.consistent).toBe(false);
    expect(cmp.issues).toContain("venue mismatch");
  });

  it("missing fields are not constraints (consistent)", () => {
    expect(compareMetadata({}, { year: 2017 }).consistent).toBe(true);
    expect(compareMetadata({ year: 2017 }, {}).consistent).toBe(true);
  });
});

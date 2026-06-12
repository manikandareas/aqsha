import { describe, expect, it } from "vitest";
import { normalizeMetaStudies } from "../convex/agent/sandbox/metaClaimExtraction";

// Slice P4.2: the pure sanitizer for LLM-extracted meta-analysis studies. Keeps
// only rows with a COMPLETE effect-size form (precomputed yi+vi|sei, two-group
// means, or two-group binary) so metaanalysis.R never sees partial input.

describe("normalizeMetaStudies", () => {
  it("keeps a precomputed yi+vi study", () => {
    const out = normalizeMetaStudies({ studies: [{ label: "A", yi: 0.4, vi: 0.02 }] });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ label: "A", yi: 0.4, vi: 0.02 });
  });

  it("accepts yi with sei in place of vi", () => {
    const out = normalizeMetaStudies({ studies: [{ label: "B", yi: 0.3, sei: 0.1 }] });
    expect(out).toHaveLength(1);
    expect(out[0].sei).toBe(0.1);
  });

  it("keeps a complete two-group means study and a binary study", () => {
    const out = normalizeMetaStudies({
      studies: [
        { label: "means", mean1: 10, sd1: 2, n1: 30, mean2: 8, sd2: 2.5, n2: 28 },
        { label: "binary", events1: 12, n1: 50, events2: 5, n2: 48 },
      ],
    });
    expect(out.map((s) => s.label)).toEqual(["means", "binary"]);
  });

  it("drops partial rows (no complete effect-size form)", () => {
    const out = normalizeMetaStudies({
      studies: [
        { label: "only-mean", mean1: 10, n1: 30 },
        { label: "yi-no-variance", yi: 0.5 },
        { label: "empty" },
      ],
    });
    expect(out).toHaveLength(0);
  });

  it("rejects non-positive variances and sample sizes", () => {
    const out = normalizeMetaStudies({
      studies: [
        { label: "zero-vi", yi: 0.4, vi: 0 },
        { label: "neg-n", mean1: 1, sd1: 1, n1: -5, mean2: 2, sd2: 1, n2: 10 },
      ],
    });
    expect(out).toHaveLength(0);
  });

  it("defaults a blank label", () => {
    const out = normalizeMetaStudies({ studies: [{ label: "   ", yi: 0.2, vi: 0.01 }] });
    expect(out[0].label).toBe("(unlabeled)");
  });
});

import { describe, expect, it } from "vitest";
import citationFixture from "./fixtures/golden-sets/citationIntegrity.json";
import { classifyIntegrity } from "../convex/agent/research/citationIntegrity";
import { classMetrics, formatMetricsMarkdown } from "../convex/agent/evals/scoring";
import { INTEGRITY_LABELS, parseCitationGolden } from "../convex/agent/evals/goldenSets";
import { emitMetrics } from "./evalEmit";

// Layer-A eval (Slice 3.3): score the pure classifyIntegrity 4-step verdict over
// a labeled golden set spanning all five IntegrityStatus classes, including the
// fabricated-citation (not_found) and conservative transient-failure cases.

describe("citation integrity golden set", () => {
  const golden = parseCitationGolden(citationFixture);
  const predicted = golden.map((g) => classifyIntegrity(g.signals));
  const expected = golden.map((g) => g.expected);
  const report = classMetrics(predicted, expected, INTEGRITY_LABELS);

  it("covers all five integrity classes at 40+ rows", () => {
    expect(golden.length).toBeGreaterThanOrEqual(40);
    for (const label of INTEGRITY_LABELS) {
      expect(report.perClass[label].support).toBeGreaterThan(0);
    }
    emitMetrics(formatMetricsMarkdown("citation integrity", report));
  });

  it("every fixture row classifies to its expected verdict", () => {
    const wrong = golden
      .map((g, i) => ({ note: g.note, want: g.expected, got: predicted[i] }))
      .filter((x) => x.got !== x.want);
    expect(wrong).toEqual([]);
  });

  it("clears the not_found recall and verified precision floors", () => {
    // not_found recall = the product promise (catch fabricated citations).
    // verified precision = no false accusations of fabrication.
    expect(report.perClass.not_found.recall).toBeGreaterThanOrEqual(0.9);
    expect(report.perClass.verified.precision).toBeGreaterThanOrEqual(0.9);
    expect(report.macroF1).toBeGreaterThanOrEqual(0.9);
  });
});

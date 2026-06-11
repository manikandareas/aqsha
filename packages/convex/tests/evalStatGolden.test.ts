import { describe, expect, it } from "vitest";
import statFixture from "./fixtures/golden-sets/statcheckVerdicts.json";
import { classifyStatcheckRow } from "../convex/agent/sandbox/statcheckClassify";
import { classMetrics, formatMetricsMarkdown } from "../convex/agent/evals/scoring";
import { STAT_VERDICT_LABELS, parseStatGolden } from "../convex/agent/evals/goldenSets";
import { emitMetrics } from "./evalEmit";

// Layer-A eval (Slice 3.3): score the pure classifyStatcheckRow over a labeled
// golden set. The classifier is ground truth for the deterministic verdict; a
// fixture mismatch is either a fixture bug or a real classifier regression.

describe("statcheck verdict golden set", () => {
  const golden = parseStatGolden(statFixture);
  const predicted = golden.map((g) => classifyStatcheckRow(g.row));
  const expected = golden.map((g) => g.expected);
  const report = classMetrics(predicted, expected, STAT_VERDICT_LABELS);

  it("covers all four verdict classes at 30+ rows", () => {
    expect(golden.length).toBeGreaterThanOrEqual(30);
    for (const label of STAT_VERDICT_LABELS) {
      expect(report.perClass[label].support).toBeGreaterThan(0);
    }
    emitMetrics(formatMetricsMarkdown("statcheck verdicts", report));
  });

  it("every fixture row classifies to its expected verdict", () => {
    const wrong = golden
      .map((g, i) => ({ note: g.note, want: g.expected, got: predicted[i] }))
      .filter((x) => x.got !== x.want);
    expect(wrong).toEqual([]);
  });

  it("clears the macro-F1 floor and the decision_error recall floor", () => {
    // decision_error is the highest-stakes class (a flipped significance
    // conclusion) — its recall floor is the strictest.
    expect(report.macroF1).toBeGreaterThanOrEqual(0.95);
    expect(report.perClass.decision_error.recall).toBeGreaterThanOrEqual(0.9);
  });
});

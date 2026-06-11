import { describe, expect, it } from "vitest";
import {
  binaryMetrics,
  classMetrics,
  formatMetricsMarkdown,
} from "../convex/agent/evals/scoring";

// The scorer must itself be trusted before it grades any classifier, so this
// self-test pins it to a hand-computed confusion matrix.

describe("classMetrics", () => {
  // predicted/expected over labels [a,b,c]:
  //   confusion (expected -> predicted):
  //     a: {a:1, b:1}  b: {a:1, b:1}  c: {c:1}
  const predicted = ["a", "a", "b", "c", "b"];
  const expected = ["a", "b", "b", "c", "a"];
  const labels = ["a", "b", "c"];
  const report = classMetrics(predicted, expected, labels);

  it("builds the confusion matrix expected->predicted", () => {
    expect(report.confusion.a).toEqual({ a: 1, b: 1, c: 0 });
    expect(report.confusion.b).toEqual({ a: 1, b: 1, c: 0 });
    expect(report.confusion.c).toEqual({ a: 0, b: 0, c: 1 });
  });

  it("computes per-class precision/recall/F1 + support", () => {
    expect(report.perClass.a).toEqual({ precision: 0.5, recall: 0.5, f1: 0.5, support: 2 });
    expect(report.perClass.b).toEqual({ precision: 0.5, recall: 0.5, f1: 0.5, support: 2 });
    expect(report.perClass.c).toEqual({ precision: 1, recall: 1, f1: 1, support: 1 });
  });

  it("computes macro averages and accuracy", () => {
    expect(report.macroPrecision).toBeCloseTo(2 / 3, 10);
    expect(report.macroRecall).toBeCloseTo(2 / 3, 10);
    expect(report.macroF1).toBeCloseTo(2 / 3, 10);
    expect(report.accuracy).toBeCloseTo(0.6, 10);
    expect(report.total).toBe(5);
  });

  it("rejects length mismatch and out-of-vocabulary labels", () => {
    expect(() => classMetrics(["a"], ["a", "b"], labels)).toThrow(/length mismatch/);
    expect(() => classMetrics(["z"], ["a"], labels)).toThrow(/not in label set/);
    expect(() => classMetrics(["a"], ["z"], labels)).toThrow(/not in label set/);
  });

  it("a perfect classifier scores 1 everywhere", () => {
    const perfect = classMetrics(["a", "b", "c"], ["a", "b", "c"], labels);
    expect(perfect.accuracy).toBe(1);
    expect(perfect.macroF1).toBe(1);
  });
});

describe("binaryMetrics", () => {
  // tp=2, fp=1, fn=1, tn=1
  const predicted = [true, true, false, false, true];
  const expected = [true, false, false, true, true];
  const report = binaryMetrics(predicted, expected);

  it("counts the confusion cells", () => {
    expect(report).toMatchObject({ tp: 2, fp: 1, fn: 1, tn: 1, total: 5 });
  });

  it("computes precision/recall/F1/accuracy", () => {
    expect(report.precision).toBeCloseTo(2 / 3, 10);
    expect(report.recall).toBeCloseTo(2 / 3, 10);
    expect(report.f1).toBeCloseTo(2 / 3, 10);
    expect(report.accuracy).toBeCloseTo(0.6, 10);
  });

  it("is divide-by-zero safe for an all-negative prediction", () => {
    const r = binaryMetrics([false, false], [true, false]);
    expect(r.precision).toBe(0);
    expect(r.recall).toBe(0);
    expect(r.f1).toBe(0);
  });
});

describe("formatMetricsMarkdown", () => {
  it("renders a multi-class table and a binary summary", () => {
    const multi = formatMetricsMarkdown(
      "stat",
      classMetrics(["a"], ["a"], ["a", "b"]),
    );
    expect(multi).toContain("#### stat");
    expect(multi).toContain("| Class | Precision | Recall | F1 | Support |");

    const binary = formatMetricsMarkdown("intent", binaryMetrics([true], [true]));
    expect(binary).toContain("#### intent");
    expect(binary).toContain("TP 1");
  });
});

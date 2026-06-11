// Pure, dependency-free scoring helpers for golden-set evals (Phase 3, Slice 3.3).
//
// These live under convex/ (NOT tests/) on purpose: eslint (`files:
// ["convex/**/*.ts"]`) and the root tsconfig `include` only cover convex/**, so a
// helper placed under tests/ would escape `bun run typecheck`/`lint` and only be
// checked at vitest runtime. The code that GRADES verification quality must be
// gate-protected, so it lives here as a pure module with no Convex registrations
// (allowed in a domain folder per AGENTS.md). The labeled fixtures and the
// *.test.ts harnesses that consume these helpers live under tests/.

export interface ClassMetrics {
  precision: number;
  recall: number;
  f1: number;
  /** Number of expected (ground-truth) items in this class. */
  support: number;
}

export interface MultiClassReport {
  /** Per-class precision/recall/F1 over the provided label set. */
  perClass: Record<string, ClassMetrics>;
  macroPrecision: number;
  macroRecall: number;
  macroF1: number;
  /** Fraction of items whose predicted label equals the expected label. */
  accuracy: number;
  /** confusion[expectedLabel][predictedLabel] = count. */
  confusion: Record<string, Record<string, number>>;
  total: number;
}

export interface BinaryReport {
  precision: number;
  recall: number;
  f1: number;
  accuracy: number;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  total: number;
}

function safeDiv(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function f1Score(precision: number, recall: number): number {
  return safeDiv(2 * precision * recall, precision + recall);
}

/**
 * Multi-class precision/recall/F1 + confusion matrix over an explicit label set.
 * `predicted` and `expected` must be parallel arrays of equal length. Any label
 * encountered that is not in `labels` is rejected (golden sets are controlled —
 * an out-of-vocabulary label is a fixture bug, not a silent miscount).
 */
export function classMetrics(
  predicted: string[],
  expected: string[],
  labels: string[],
): MultiClassReport {
  if (predicted.length !== expected.length) {
    throw new Error(
      `classMetrics: predicted (${predicted.length}) and expected (${expected.length}) length mismatch`,
    );
  }
  const labelSet = new Set(labels);
  const confusion: Record<string, Record<string, number>> = {};
  for (const e of labels) {
    confusion[e] = {};
    for (const p of labels) confusion[e][p] = 0;
  }

  let correct = 0;
  for (let i = 0; i < expected.length; i++) {
    const e = expected[i];
    const p = predicted[i];
    if (!labelSet.has(e)) throw new Error(`classMetrics: expected label "${e}" not in label set`);
    if (!labelSet.has(p)) throw new Error(`classMetrics: predicted label "${p}" not in label set`);
    confusion[e][p] += 1;
    if (e === p) correct += 1;
  }

  const perClass: Record<string, ClassMetrics> = {};
  let macroP = 0;
  let macroR = 0;
  let macroF = 0;
  for (const c of labels) {
    const tp = confusion[c][c];
    let fp = 0;
    let fn = 0;
    let support = 0;
    for (const other of labels) {
      if (other !== c) fp += confusion[other][c];
      fn += other === c ? 0 : confusion[c][other];
      support += confusion[c][other];
    }
    const precision = safeDiv(tp, tp + fp);
    const recall = safeDiv(tp, tp + fn);
    perClass[c] = { precision, recall, f1: f1Score(precision, recall), support };
    macroP += precision;
    macroR += recall;
    macroF += perClass[c].f1;
  }
  const n = labels.length || 1;
  return {
    perClass,
    macroPrecision: macroP / n,
    macroRecall: macroR / n,
    macroF1: macroF / n,
    accuracy: safeDiv(correct, expected.length),
    confusion,
    total: expected.length,
  };
}

/**
 * Binary precision/recall/F1 for fires-vs-silent style evals (intent detection,
 * skill triggering). `true` is the positive class.
 */
export function binaryMetrics(predicted: boolean[], expected: boolean[]): BinaryReport {
  if (predicted.length !== expected.length) {
    throw new Error(
      `binaryMetrics: predicted (${predicted.length}) and expected (${expected.length}) length mismatch`,
    );
  }
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  for (let i = 0; i < expected.length; i++) {
    const p = predicted[i];
    const e = expected[i];
    if (p && e) tp += 1;
    else if (p && !e) fp += 1;
    else if (!p && e) fn += 1;
    else tn += 1;
  }
  const precision = safeDiv(tp, tp + fp);
  const recall = safeDiv(tp, tp + fn);
  return {
    precision,
    recall,
    f1: f1Score(precision, recall),
    accuracy: safeDiv(tp + tn, expected.length),
    tp,
    fp,
    fn,
    tn,
    total: expected.length,
  };
}

function pct(value: number): string {
  return (value * 100).toFixed(1) + "%";
}

/**
 * Render a metrics block as GitHub-flavored markdown for the Actions step summary.
 * A CI step greps these blocks out of the test stdout and appends them to
 * $GITHUB_STEP_SUMMARY (mirroring statverify-snapshot.yml's heredoc style).
 */
export function formatMetricsMarkdown(
  name: string,
  report: MultiClassReport | BinaryReport,
): string {
  const lines: string[] = [`#### ${name}`, ""];
  if ("perClass" in report) {
    lines.push(
      `Accuracy **${pct(report.accuracy)}** · macro-F1 **${pct(report.macroF1)}** · n=${report.total}`,
      "",
      "| Class | Precision | Recall | F1 | Support |",
      "| --- | --- | --- | --- | --- |",
    );
    for (const [label, m] of Object.entries(report.perClass)) {
      lines.push(
        `| ${label} | ${pct(m.precision)} | ${pct(m.recall)} | ${pct(m.f1)} | ${m.support} |`,
      );
    }
  } else {
    lines.push(
      `Precision **${pct(report.precision)}** · Recall **${pct(report.recall)}** · F1 **${pct(report.f1)}** · Accuracy ${pct(report.accuracy)} · n=${report.total}`,
      "",
      `TP ${report.tp} · FP ${report.fp} · FN ${report.fn} · TN ${report.tn}`,
    );
  }
  return lines.join("\n");
}

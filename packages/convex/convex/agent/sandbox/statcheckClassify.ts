// Pure, deterministic interpretation of statcheck's raw recompute output. This
// module has NO Convex or Node dependencies so it can be unit-tested in
// isolation. statcheck (in the sandbox) does the hard part — recomputing the
// exact p-value from a test statistic + df — and emits raw numbers; here we
// decide the `computationChecks.outcome` from (reported p, recomputed p) under
// an EXPLICIT tolerance. Keeping the recompute and the verdict separate is the
// determinism invariant: the stored raw numbers never change, only the
// interpretation, and the tolerance that produced it is recorded alongside.

import type { ComputationOutcome } from "./computationOutcome";

// Re-exported so existing importers keep their import site; the canonical home
// for the shared outcome vocabulary is computationOutcome.ts.
export {
  summarizeOutcomes,
  type OutcomeSummary,
} from "./computationOutcome";
export type { ComputationOutcome } from "./computationOutcome";

// One parsed NHST result emitted by statcheck.R. Numbers may be null when
// statcheck could not parse or recompute them.
export interface StatcheckRawRow {
  source?: string | null;
  statistic?: string | null;
  df1?: number | null;
  df2?: number | null;
  testValue?: number | null;
  reportedComparison: string;
  reportedPValue: number | null;
  computedPValue: number | null;
  raw?: string | null;
  // statcheck's own flags — retained as transparency metadata only; the outcome
  // below is recomputed from the numbers, not read from these.
  statcheckError?: boolean | null;
  statcheckDecisionError?: boolean | null;
  oneTailedInTxt?: boolean | null;
}

export interface StatcheckTolerance {
  // Significance threshold used to detect a flipped decision (reported claims
  // significant but the recomputed p is not, or vice versa).
  alpha: number;
  // How the "=" comparison is reconciled: the recomputed p is rounded to the
  // reported value's printed precision before comparison (statcheck's rule).
  rounding: "reported_decimals";
  // statcheck recomputes two-tailed p-values by default.
  tails: "two";
}

export const DEFAULT_STATCHECK_TOLERANCE: StatcheckTolerance = {
  alpha: 0.05,
  rounding: "reported_decimals",
  tails: "two",
};

type Comparison = "=" | "<" | ">";

function normalizeComparison(raw: string): Comparison {
  const t = (raw ?? "").trim();
  if (t === "<" || t === "<=" || t === "≤") return "<";
  if (t === ">" || t === ">=" || t === "≥") return ">";
  return "=";
}

// Number of decimal places in a value's canonical decimal representation,
// clamped to [1, 6]. Used as the rounding precision for "=" comparisons.
function reportedDecimals(value: number): number {
  if (!Number.isFinite(value)) return 2;
  const abs = Math.abs(value);
  const s = abs.toString();
  let decimals: number;
  if (s.includes("e") || s.includes("E")) {
    const m = /e-(\d+)/i.exec(s);
    decimals = m ? parseInt(m[1], 10) : 0;
  } else {
    const dot = s.indexOf(".");
    decimals = dot === -1 ? 0 : s.length - dot - 1;
  }
  return Math.min(6, Math.max(1, decimals));
}

function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

// Whether the REPORTED value claims statistical significance at alpha, or null
// when the report is too coarse to decide (e.g. "p < .10" at alpha .05).
function reportedSignificant(
  cmp: Comparison,
  reportedP: number,
  alpha: number,
): boolean | null {
  if (cmp === "=") return reportedP < alpha;
  if (cmp === "<") return reportedP <= alpha ? true : null;
  // ">"
  return reportedP >= alpha ? false : null;
}

/**
 * Classify a single statcheck result into a computationChecks outcome.
 *
 * Priority: not_computable > decision_error > discrepant > consistent. A
 * decision error (the significance conclusion flips) is the most consequential
 * inconsistency, so it wins over a plain numeric discrepancy.
 */
export function classifyStatcheckRow(
  row: StatcheckRawRow,
  tolerance: StatcheckTolerance = DEFAULT_STATCHECK_TOLERANCE,
): ComputationOutcome {
  const reportedP = row.reportedPValue;
  const computedP = row.computedPValue;
  if (
    reportedP == null ||
    computedP == null ||
    !Number.isFinite(reportedP) ||
    !Number.isFinite(computedP)
  ) {
    return "not_computable";
  }

  const cmp = normalizeComparison(row.reportedComparison);
  const decimals = reportedDecimals(reportedP);
  const boundaryAllowance = 0.5 * Math.pow(10, -decimals);

  const reportedSig = reportedSignificant(cmp, reportedP, tolerance.alpha);
  const computedSig = computedP < tolerance.alpha;
  const decisionError = reportedSig !== null && reportedSig !== computedSig;

  let numericConsistent: boolean;
  if (cmp === "=") {
    numericConsistent = roundTo(computedP, decimals) === roundTo(reportedP, decimals);
  } else if (cmp === "<") {
    numericConsistent = computedP < reportedP + boundaryAllowance;
  } else {
    numericConsistent = computedP > reportedP - boundaryAllowance;
  }

  if (decisionError) return "decision_error";
  if (!numericConsistent) return "discrepant";
  return "consistent";
}

function asNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asBooleanOrNull(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === "TRUE" || value === "true") return true;
  if (value === "FALSE" || value === "false") return false;
  return null;
}

function asStringOrNull(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return null;
}

function coerceRow(value: unknown): StatcheckRawRow | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  return {
    source: asStringOrNull(obj.source),
    statistic: asStringOrNull(obj.statistic),
    df1: asNumberOrNull(obj.df1),
    df2: asNumberOrNull(obj.df2),
    testValue: asNumberOrNull(obj.testValue),
    reportedComparison:
      typeof obj.reportedComparison === "string" ? obj.reportedComparison : "=",
    reportedPValue: asNumberOrNull(obj.reportedPValue),
    computedPValue: asNumberOrNull(obj.computedPValue),
    raw: asStringOrNull(obj.raw),
    statcheckError: asBooleanOrNull(obj.statcheckError),
    statcheckDecisionError: asBooleanOrNull(obj.statcheckDecisionError),
    oneTailedInTxt: asBooleanOrNull(obj.oneTailedInTxt),
  };
}

/**
 * Parse the JSON array emitted on stdout by statcheck.R into typed rows,
 * tolerating leading R noise before the array and malformed payloads (returns
 * [] rather than throwing, so a verification run degrades to "nothing
 * checkable" instead of failing).
 */
export function parseStatcheckStdout(stdout: string): StatcheckRawRow[] {
  const trimmed = (stdout ?? "").trim();
  if (!trimmed) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("[");
    const end = trimmed.lastIndexOf("]");
    if (start === -1 || end === -1 || end < start) return [];
    try {
      parsed = JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map(coerceRow)
    .filter((row): row is StatcheckRawRow => row !== null);
}

// Human-readable fallback claim text when statcheck did not surface the raw
// matched span (e.g. "t(28) = 2.10, p = .04").
export function buildClaimText(row: StatcheckRawRow): string {
  if (row.raw && row.raw.trim()) return row.raw.trim();
  const stat = row.statistic ?? "stat";
  const dfPart =
    row.df1 != null && row.df2 != null
      ? `(${row.df1}, ${row.df2})`
      : row.df1 != null
        ? `(${row.df1})`
        : "";
  const value = row.testValue != null ? row.testValue : "?";
  const cmp = row.reportedComparison || "=";
  const p = row.reportedPValue != null ? row.reportedPValue : "?";
  return `${stat}${dfPart} = ${value}, p ${cmp} ${p}`;
}

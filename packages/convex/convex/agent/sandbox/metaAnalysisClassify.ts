// Pure interpretation of the meta-analysis envelope emitted by metaanalysis.R.
// Unlike statcheck/GRIM/power, a meta-analysis is NOT a per-claim
// consistent/discrepant check — it is a single pooled SUMMARY object — so it does
// not feed `computationChecks` or `buildVerificationReport`. This module parses
// the JSON envelope and adds light, neutral interpretation helpers. No Convex/Node
// deps → unit testable.

export type MetaAnalysisStatus =
  | "ok"
  | "no_studies"
  | "insufficient_studies"
  | "model_error";

export interface MetaAnalysisSummary {
  status: "ok";
  k: number;
  measure: string;
  pooledEstimate: number;
  ciLower: number;
  ciUpper: number;
  pValue: number;
  tau2: number;
  /** I² as a percentage (0–100): share of variance from heterogeneity. */
  i2: number;
  q: number;
  qPValue: number;
  /** Egger's regression test p-value; null when k < 3 or it could not run. */
  eggerPValue: number | null;
  /** Trim-and-fill bias-adjusted pooled estimate; null when unavailable. */
  trimfillEstimate: number | null;
  /** Number of studies trim-and-fill imputed; null when unavailable. */
  trimfillImputed: number | null;
}

export interface MetaAnalysisError {
  status: "no_studies" | "insufficient_studies" | "model_error";
  k: number;
  measure?: string;
}

export type MetaAnalysisResult = MetaAnalysisSummary | MetaAnalysisError;

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function numberOr(value: unknown, fallback: number): number {
  return numberOrNull(value) ?? fallback;
}

// Parse the single JSON object the R script prints. Tolerates leading/trailing
// noise by locating the outermost braces (mirrors parsePowerStdout). Returns null
// when nothing parseable is found.
export function parseMetaStdout(stdout: string): MetaAnalysisResult | null {
  const trimmed = (stdout ?? "").trim();
  if (!trimmed) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1 || end < start) return null;
    try {
      parsed = JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const status = typeof obj.status === "string" ? obj.status : "";
  const k = Math.max(0, Math.round(numberOr(obj.k, 0)));

  if (status === "ok") {
    return {
      status: "ok",
      k,
      measure: typeof obj.measure === "string" ? obj.measure : "GEN",
      pooledEstimate: numberOr(obj.pooledEstimate, 0),
      ciLower: numberOr(obj.ciLower, 0),
      ciUpper: numberOr(obj.ciUpper, 0),
      pValue: numberOr(obj.pValue, 1),
      tau2: numberOr(obj.tau2, 0),
      i2: numberOr(obj.i2, 0),
      q: numberOr(obj.q, 0),
      qPValue: numberOr(obj.qPValue, 1),
      eggerPValue: numberOrNull(obj.eggerPValue),
      trimfillEstimate: numberOrNull(obj.trimfillEstimate),
      trimfillImputed: numberOrNull(obj.trimfillImputed),
    };
  }
  if (
    status === "no_studies" ||
    status === "insufficient_studies" ||
    status === "model_error"
  ) {
    return {
      status,
      k,
      measure: typeof obj.measure === "string" ? obj.measure : undefined,
    };
  }
  return null;
}

// Neutral heterogeneity band from I² (Cochrane rules of thumb). Heterogeneity is
// described, never treated as an error.
export function describeHeterogeneity(i2: number): "low" | "moderate" | "high" {
  if (i2 >= 75) return "high";
  if (i2 >= 50) return "moderate";
  return "low";
}

// Whether the publication-bias diagnostics warrant a cautionary note (a signal to
// interpret carefully — NOT proof of bias). Egger requires enough studies to be
// meaningful, hence the k floor.
export function suggestsPublicationBias(summary: MetaAnalysisSummary): boolean {
  if (summary.k < 10) return false;
  if (summary.eggerPValue != null && summary.eggerPValue < 0.05) return true;
  return (summary.trimfillImputed ?? 0) > 0;
}

// Pure interpretation of GRIM / GRIMMER output (scrutiny / rsprite2 in the
// sandbox). GRIM tests whether a reported mean is even arithmetically possible
// given the sample size and item granularity; GRIMMER extends the test to the
// standard deviation. The sandbox does the recompute; here we parse its JSON and
// map each result to a computationChecks outcome. No Convex/Node deps → unit
// testable in isolation.

import type { ComputationOutcome } from "./computationOutcome";

// One GRIM claim extracted from the paper (mean/SD/N/items). `items` is the
// number of scale items averaged into the mean (granularity = 1 / (n * items)).
export interface GrimClaim {
  label: string;
  mean: number;
  sd?: number | null;
  n: number;
  items: number;
}

// One result row emitted by grim.R. Consistency flags are null when scrutiny
// could not evaluate the claim (e.g. missing/invalid inputs).
export interface GrimResultRow {
  label?: string | null;
  mean?: number | null;
  sd?: number | null;
  n?: number | null;
  items?: number | null;
  grimConsistent?: boolean | null;
  grimmerConsistent?: boolean | null;
}

export interface GrimCheck {
  kind: "grim" | "grimmer";
  outcome: ComputationOutcome;
  label: string;
  mean: number | null;
  sd: number | null;
  n: number | null;
  items: number | null;
}

function outcomeFromFlag(consistent: boolean | null | undefined): ComputationOutcome {
  if (consistent == null) return "not_computable";
  return consistent ? "consistent" : "discrepant";
}

/**
 * Map one grim.R result row to its check(s): always a GRIM check, plus a
 * GRIMMER check when an SD was provided and scrutiny evaluated it.
 */
export function classifyGrimRow(row: GrimResultRow): GrimCheck[] {
  const label = row.label?.trim() || "(unlabeled)";
  const base = {
    label,
    mean: row.mean ?? null,
    sd: row.sd ?? null,
    n: row.n ?? null,
    items: row.items ?? null,
  };
  const checks: GrimCheck[] = [
    { kind: "grim", outcome: outcomeFromFlag(row.grimConsistent), ...base },
  ];
  if (row.sd != null && row.grimmerConsistent !== undefined) {
    checks.push({
      kind: "grimmer",
      outcome: outcomeFromFlag(row.grimmerConsistent),
      ...base,
    });
  }
  return checks;
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

function coerceRow(value: unknown): GrimResultRow | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  return {
    label: typeof obj.label === "string" ? obj.label : null,
    mean: asNumberOrNull(obj.mean),
    sd: asNumberOrNull(obj.sd),
    n: asNumberOrNull(obj.n),
    items: asNumberOrNull(obj.items),
    grimConsistent: asBooleanOrNull(obj.grimConsistent),
    grimmerConsistent: asBooleanOrNull(obj.grimmerConsistent),
  };
}

export function parseGrimStdout(stdout: string): GrimResultRow[] {
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
    .filter((row): row is GrimResultRow => row !== null);
}

export function grimClaimLabel(claim: GrimClaim): string {
  const itemsPart = claim.items > 1 ? `, ${claim.items} item` : "";
  const sdPart = claim.sd != null ? `, SD = ${claim.sd}` : "";
  return `${claim.label}: M = ${claim.mean}${sdPart}, N = ${claim.n}${itemsPart}`;
}

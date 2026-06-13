// Pure interpretation of power-analysis output (pwr in the sandbox). Framing is
// deliberately PROSPECTIVE, not post-hoc: "power to detect a pre-specified
// effect at this N", never observed/achieved power computed from the result
// itself. A power check is INFORMATIONAL — it does not assert an inconsistency —
// so a computed value maps to "consistent" (we recomputed it) and only an
// uncomputable claim maps to "not_computable". The adequacy read (vs the
// conventional .80) lives in the recomputed payload + the neutral summary, not
// in the outcome enum. No Convex/Node deps → unit testable.

import type { ComputationOutcome } from "./computationOutcome";

// Conventional adequacy threshold for prospective power (Cohen).
export const POWER_ADEQUACY_THRESHOLD = 0.8;

export type PowerTest = "t" | "anova" | "correlation" | "proportion" | "chisq";

// One power claim extracted from the paper: the test, its N, the pre-specified
// effect size, and alpha. `tails` applies to t-tests.
export interface PowerClaim {
  label: string;
  test: PowerTest;
  n: number;
  effectSize: number;
  alpha: number;
  tails?: 1 | 2;
}

export interface PowerResultRow {
  label?: string | null;
  test?: string | null;
  n?: number | null;
  effectSize?: number | null;
  alpha?: number | null;
  power?: number | null;
}

export interface PowerCheck {
  kind: "power";
  outcome: ComputationOutcome;
  label: string;
  test: string | null;
  n: number | null;
  effectSize: number | null;
  alpha: number | null;
  power: number | null;
  adequate: boolean | null;
}

/**
 * Map one power.R result row to a power check. Computed → "consistent" (the
 * recompute succeeded); uncomputable → "not_computable". Adequacy is recorded
 * separately, never folded into the outcome.
 */
export function classifyPowerRow(row: PowerResultRow): PowerCheck {
  const power = row.power ?? null;
  const outcome: ComputationOutcome =
    power == null || !Number.isFinite(power) ? "not_computable" : "consistent";
  return {
    kind: "power",
    outcome,
    label: row.label?.trim() || "(unlabeled)",
    test: row.test ?? null,
    n: row.n ?? null,
    effectSize: row.effectSize ?? null,
    alpha: row.alpha ?? null,
    power,
    adequate: power == null ? null : power >= POWER_ADEQUACY_THRESHOLD,
  };
}

function asNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function coerceRow(value: unknown): PowerResultRow | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  return {
    label: typeof obj.label === "string" ? obj.label : null,
    test: typeof obj.test === "string" ? obj.test : null,
    n: asNumberOrNull(obj.n),
    effectSize: asNumberOrNull(obj.effectSize),
    alpha: asNumberOrNull(obj.alpha),
    power: asNumberOrNull(obj.power),
  };
}

export function parsePowerStdout(stdout: string): PowerResultRow[] {
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
    .filter((row): row is PowerResultRow => row !== null);
}

export function powerClaimLabel(claim: PowerClaim): string {
  return `${claim.label}: ${claim.test}, N = ${claim.n}, effect = ${claim.effectSize}`;
}

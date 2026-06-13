// Per-artifact statistical verification report — the single summary persisted on
// agentRuns2.verificationReportJson and surfaced to the user. Pure builder so the
// verdict logic is unit-testable. Neutral by construction: only a flipped
// significance decision escalates to "needs_review"; a mere numeric discrepancy
// or an uncheckable claim is a note, never a failure (a discrepancy is not
// fraud). A failed run (sandbox/infra error) is the only "failed" verdict.

import {
  emptyOutcomeSummary,
  summarizeOutcomes,
  type ComputationCheckKind,
  type ComputationOutcome,
  type OutcomeSummary,
} from "./computationOutcome";

export type VerificationVerdict =
  | "passed"
  | "passed_with_notes"
  | "needs_review"
  | "failed";

const CHECK_KINDS: ComputationCheckKind[] = [
  "statcheck",
  "grim",
  "grimmer",
  "power",
];

export interface VerificationReportInput {
  artifactId: string;
  runFailed: boolean;
  sandboxRunIds: string[];
  checks: Array<{ checkKind: ComputationCheckKind; outcome: ComputationOutcome }>;
}

export interface VerificationReport {
  artifactId: string;
  verdict: VerificationVerdict;
  statistics: OutcomeSummary;
  byKind: Record<ComputationCheckKind, OutcomeSummary>;
  sandboxRunIds: string[];
}

export function verificationVerdict(
  summary: OutcomeSummary,
  runFailed: boolean,
): VerificationVerdict {
  if (runFailed) return "failed";
  if (summary.decisionErrors > 0) return "needs_review";
  if (
    summary.discrepant > 0 ||
    summary.notComputable > 0 ||
    summary.checked === 0
  ) {
    return "passed_with_notes";
  }
  return "passed";
}

export function buildVerificationReport(
  input: VerificationReportInput,
): VerificationReport {
  const byKind = Object.fromEntries(
    CHECK_KINDS.map((kind) => [
      kind,
      summarizeOutcomes(
        input.checks
          .filter((check) => check.checkKind === kind)
          .map((check) => check.outcome),
      ),
    ]),
  ) as Record<ComputationCheckKind, OutcomeSummary>;

  const statistics = summarizeOutcomes(input.checks.map((check) => check.outcome));

  return {
    artifactId: input.artifactId,
    verdict: verificationVerdict(statistics, input.runFailed),
    statistics,
    byKind,
    sandboxRunIds: input.sandboxRunIds,
  };
}

export function emptyVerificationReport(
  artifactId: string,
): VerificationReport {
  return {
    artifactId,
    verdict: "passed_with_notes",
    statistics: emptyOutcomeSummary(),
    byKind: {
      statcheck: emptyOutcomeSummary(),
      grim: emptyOutcomeSummary(),
      grimmer: emptyOutcomeSummary(),
      power: emptyOutcomeSummary(),
    },
    sandboxRunIds: [],
  };
}

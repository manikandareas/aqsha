// Shared vocabulary for sandbox computation checks, independent of any single
// check kind (statcheck / GRIM / GRIMMER / power). Pure and dependency-free so
// every classifier and the report builder can share it and be unit-tested in
// isolation.

export type ComputationOutcome =
  | "consistent"
  | "discrepant"
  | "decision_error"
  | "not_computable";

export type ComputationCheckKind = "statcheck" | "grim" | "grimmer" | "power";

export interface OutcomeSummary {
  checked: number;
  consistent: number;
  discrepant: number;
  decisionErrors: number;
  notComputable: number;
}

export function emptyOutcomeSummary(): OutcomeSummary {
  return {
    checked: 0,
    consistent: 0,
    discrepant: 0,
    decisionErrors: 0,
    notComputable: 0,
  };
}

export function summarizeOutcomes(outcomes: ComputationOutcome[]): OutcomeSummary {
  const summary = emptyOutcomeSummary();
  summary.checked = outcomes.length;
  for (const outcome of outcomes) {
    if (outcome === "consistent") summary.consistent += 1;
    else if (outcome === "discrepant") summary.discrepant += 1;
    else if (outcome === "decision_error") summary.decisionErrors += 1;
    else summary.notComputable += 1;
  }
  return summary;
}

export function addOutcomeSummaries(
  a: OutcomeSummary,
  b: OutcomeSummary,
): OutcomeSummary {
  return {
    checked: a.checked + b.checked,
    consistent: a.consistent + b.consistent,
    discrepant: a.discrepant + b.discrepant,
    decisionErrors: a.decisionErrors + b.decisionErrors,
    notComputable: a.notComputable + b.notComputable,
  };
}

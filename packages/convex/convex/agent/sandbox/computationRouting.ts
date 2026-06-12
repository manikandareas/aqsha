// Pure routing for the approval-gated runComputation tool: maps a requested
// taskKind to how it executes at the current Daytona tier. statcheck/GRIM/power
// AND meta-analysis run inline from the pre-baked snapshot with no egress —
// meta-analysis pools effect sizes supplied IN the artifact (no download). Only
// replication (git clone + dataset download = egress) and custom analysis (an
// audited custom-script path) are tier-blocked; they stay deferred (the long-job
// workflow in computationWorkflow.ts is the ready activation point once the tier
// supports egress). Dependency-free → unit testable.

export const COMPUTATION_TASK_KINDS = [
  "stat_verification",
  "replication",
  "meta_analysis",
  "custom_analysis",
] as const;

export type ComputationTaskKind = (typeof COMPUTATION_TASK_KINDS)[number];

export type ComputationExecution = "inline" | "tier_unavailable";

export function routeComputationTaskKind(
  taskKind: ComputationTaskKind,
): ComputationExecution {
  return taskKind === "stat_verification" || taskKind === "meta_analysis"
    ? "inline"
    : "tier_unavailable";
}

// A reported test statistic with degrees of freedom, e.g. t(38), F(2, 57),
// r(28), χ²(1), z = 1.9. statcheck recomputes the p-value FROM these, so a bare
// p-value alone is not recomputable — we require a test statistic too.
const NHST_TEST_STATISTIC =
  /\b(?:[tFrz]\s*\(\s*\d+(?:\.\d+)?|χ\s*2?\s*\(\s*\d|chi-?squared?\s*\(\s*\d|z\s*=\s*-?\d)/i;
const NHST_P_VALUE = /\bp\s*[<>=]\s*-?0?\.\d/i;

// Cheap gate for the deep-research auto stat pass: only worth running statcheck
// when the report actually reports NHST results (a test statistic AND a
// p-value). Pure + unit-tested; avoids provisioning a sandbox for prose with no
// recomputable statistics.
export function hasNhstReporting(text: string): boolean {
  return NHST_TEST_STATISTIC.test(text) && NHST_P_VALUE.test(text);
}

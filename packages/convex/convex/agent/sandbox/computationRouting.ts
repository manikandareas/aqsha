// Pure routing for the approval-gated runComputation tool: maps a requested
// taskKind to how it executes at the current Daytona tier. statcheck/GRIM/power
// run inline from the pre-baked snapshot with no egress. Replication &
// meta-analysis need git clone / data download (egress), which this account's
// tier blocks; custom analysis needs an audited custom-script path. Both are
// deferred (the long-job workflow in computationWorkflow.ts is the ready
// activation point once the tier supports egress). Dependency-free → unit
// testable.

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
  return taskKind === "stat_verification" ? "inline" : "tier_unavailable";
}

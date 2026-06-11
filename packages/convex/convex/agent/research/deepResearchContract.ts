// Shared contract for the signal `startDeepResearch` emits when it hands a turn
// off to the durable deep-research workflow.
//   Producer: agent/hitl/hitlTools.ts (startDeepResearch.execute return value).
//   Consumer: agent/messages.ts (the deep-branch handler in runInlineGeneration).
// A typed guard replaces a bare `output.status === "..."` string-match: if the
// result shape ever changes, the contract test fails loudly instead of the run
// silently double-completing.
export const DEEP_RESEARCH_STARTED_STATUS = "deep_research_started" as const;

export type DeepResearchStartedResult = {
  status: typeof DEEP_RESEARCH_STARTED_STATUS;
  workflowId: string;
};

export function isDeepResearchStartedResult(
  value: unknown,
): value is DeepResearchStartedResult {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as { status?: unknown; workflowId?: unknown };
  return (
    candidate.status === DEEP_RESEARCH_STARTED_STATUS &&
    typeof candidate.workflowId === "string"
  );
}

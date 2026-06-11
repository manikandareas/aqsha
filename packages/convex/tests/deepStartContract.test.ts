import { describe, expect, it } from "vitest";
import {
  DEEP_RESEARCH_STARTED_STATUS,
  isDeepResearchStartedResult,
} from "../convex/agent/research/deepResearchContract";

// Locks the producer (hitlTools.startDeepResearch) and consumer (messages.ts
// deep-branch) to one typed shape, so a change to the result shape fails here
// instead of silently double-completing the run.
describe("deep-research start contract", () => {
  it("accepts the producer's exact return shape", () => {
    const produced = {
      status: DEEP_RESEARCH_STARTED_STATUS,
      workflowId: "wf_123",
    };
    expect(isDeepResearchStartedResult(produced)).toBe(true);
  });

  it("rejects near-misses", () => {
    expect(
      isDeepResearchStartedResult({ status: DEEP_RESEARCH_STARTED_STATUS }),
    ).toBe(false); // missing workflowId
    expect(
      isDeepResearchStartedResult({
        status: DEEP_RESEARCH_STARTED_STATUS,
        workflowId: 123,
      }),
    ).toBe(false); // workflowId wrong type
    expect(
      isDeepResearchStartedResult({ status: "executed", workflowId: "wf_1" }),
    ).toBe(false); // a different tool's status must not trip deep-start
    expect(isDeepResearchStartedResult(undefined)).toBe(false);
    expect(isDeepResearchStartedResult("deep_research_started")).toBe(false);
  });

  it("pins the status constant", () => {
    expect(DEEP_RESEARCH_STARTED_STATUS).toBe("deep_research_started");
  });
});

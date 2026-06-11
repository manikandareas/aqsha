import { describe, expect, it } from "vitest";
import {
  HITL_CARD_TOOL_NAMES,
  HITL_INITIAL_TOOL_NAMES,
  PENDING_HITL_TOOL_NAMES,
} from "../convex/agent/hitl/hitlToolNames";

// Locks the three HITL tool-name sets together. They used to be hand-maintained
// in three places (backend, client, prose) and had silently diverged; these
// assertions fail loudly if the relationships ever break again.
describe("HITL tool-name sets", () => {
  it("pending = initial + executeArtifact + startDeepResearch + runComputation", () => {
    expect([...PENDING_HITL_TOOL_NAMES].sort()).toEqual(
      [
        ...HITL_INITIAL_TOOL_NAMES,
        "executeArtifact",
        "startDeepResearch",
        "runComputation",
      ].sort(),
    );
  });

  it("client card set = pending minus executeArtifact", () => {
    const expected = PENDING_HITL_TOOL_NAMES.filter(
      (name) => name !== "executeArtifact",
    );
    expect([...HITL_CARD_TOOL_NAMES].sort()).toEqual([...expected].sort());
  });

  it("startDeepResearch renders as a card; executeArtifact does not", () => {
    expect(HITL_CARD_TOOL_NAMES).toContain("startDeepResearch");
    expect(HITL_CARD_TOOL_NAMES).not.toContain("executeArtifact");
  });

  it("initial turn withholds executeArtifact and startDeepResearch", () => {
    expect(HITL_INITIAL_TOOL_NAMES).not.toContain("executeArtifact");
    expect(HITL_INITIAL_TOOL_NAMES).not.toContain("startDeepResearch");
  });
});

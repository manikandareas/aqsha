import { describe, expect, it } from "vitest";
import {
  COMPUTATION_TASK_KINDS,
  routeComputationTaskKind,
} from "../convex/agent/sandbox/computationRouting";
import { SANDBOX_TOOL_NAMES } from "../convex/agent/sandbox/sandboxTools";
import {
  HITL_CARD_TOOL_NAME_SET,
  PENDING_HITL_TOOL_NAME_SET,
} from "../convex/agent/hitl/hitlToolNames";

// Slice 1.4: the approval-gated runComputation routing + its HITL wiring.

describe("routeComputationTaskKind", () => {
  it("runs stat_verification inline", () => {
    expect(routeComputationTaskKind("stat_verification")).toBe("inline");
  });

  it("marks egress/long-running task kinds as tier_unavailable", () => {
    expect(routeComputationTaskKind("replication")).toBe("tier_unavailable");
    expect(routeComputationTaskKind("meta_analysis")).toBe("tier_unavailable");
    expect(routeComputationTaskKind("custom_analysis")).toBe("tier_unavailable");
  });

  it("enumerates exactly the four allowlisted task kinds", () => {
    expect([...COMPUTATION_TASK_KINDS]).toEqual([
      "stat_verification",
      "replication",
      "meta_analysis",
      "custom_analysis",
    ]);
  });
});

describe("sandbox tool wiring", () => {
  it("exposes both the auto and approval-gated tools", () => {
    expect([...SANDBOX_TOOL_NAMES]).toEqual(["verifyStatistics", "runComputation"]);
  });

  it("wires runComputation into the HITL pending + card sets so approval pauses and renders", () => {
    expect(PENDING_HITL_TOOL_NAME_SET.has("runComputation")).toBe(true);
    expect(HITL_CARD_TOOL_NAME_SET.has("runComputation")).toBe(true);
  });

  it("keeps verifyStatistics out of the HITL sets (it is auto-execute, not approval-gated)", () => {
    expect(PENDING_HITL_TOOL_NAME_SET.has("verifyStatistics")).toBe(false);
    expect(HITL_CARD_TOOL_NAME_SET.has("verifyStatistics")).toBe(false);
  });
});

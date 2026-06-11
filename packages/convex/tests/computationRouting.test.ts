import { describe, expect, it } from "vitest";
import {
  COMPUTATION_TASK_KINDS,
  hasNhstReporting,
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

describe("hasNhstReporting (deep-research stat-pass gate)", () => {
  it("fires when a test statistic AND a p-value are both reported", () => {
    expect(hasNhstReporting("The effect was significant, t(38) = 2.10, p = .04.")).toBe(true);
    expect(hasNhstReporting("ANOVA showed F(2, 57) = 4.3, p < .05 across groups.")).toBe(true);
    expect(hasNhstReporting("A correlation r(28) = .51, p = 0.003 was found.")).toBe(true);
  });

  it("does NOT fire on prose with no recomputable statistics", () => {
    // A p-value alone is not recomputable without a test statistic.
    expect(hasNhstReporting("The result was significant (p < .05).")).toBe(false);
    // A test statistic alone (no p-value) — nothing to reconcile.
    expect(hasNhstReporting("The model reported t(38) = 2.1 for the slope.")).toBe(false);
    expect(hasNhstReporting("This review synthesizes qualitative findings only.")).toBe(false);
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

import { describe, expect, it } from "vitest";
import {
  auditConcurrencyForAgent,
  computeEvidencePatch,
  enforceUnsupportedClaim,
  linkComputationToClaim,
  mapWithConcurrency,
  resolveEvidenceKind,
  type ComputationRef,
} from "../convex/agent/research/claimEvidence";

function comp(overrides: Partial<ComputationRef>): ComputationRef {
  return {
    computationCheckId: "c1",
    claimText: "t(28) = 2.10, p = .04",
    outcome: "consistent",
    ...overrides,
  };
}

describe("linkComputationToClaim", () => {
  const claim = "The effect was significant, t(28) = 2.10, p = .04, across groups [3].";

  it("links a computation whose span appears in the claim (whitespace-insensitive)", () => {
    const link = linkComputationToClaim(claim, [comp({ claimSpan: "t(28)=2.10, p=.04" })]);
    expect(link.computationCheckIds).toEqual(["c1"]);
    expect(link.matchedConsistent).toBe(true);
    expect(link.matchedAdverse).toBe(false);
    expect(link.claimSpan).toBe("t(28)=2.10, p=.04");
  });

  it("flags an adverse (discrepant/decision_error) match without marking it consistent", () => {
    const link = linkComputationToClaim(claim, [
      comp({ claimSpan: "t(28) = 2.10, p = .04", outcome: "decision_error" }),
    ]);
    expect(link.matchedConsistent).toBe(false);
    expect(link.matchedAdverse).toBe(true);
    expect(link.computationCheckIds).toEqual(["c1"]);
  });

  it("returns no link when the span does not appear in the claim", () => {
    const link = linkComputationToClaim("A qualitative claim with no numbers.", [comp({})]);
    expect(link.computationCheckIds).toEqual([]);
    expect(link.matchedConsistent).toBe(false);
    expect(link.claimSpan).toBeUndefined();
  });

  it("collects multiple matches and records the first span", () => {
    const link = linkComputationToClaim(
      "Results: t(28) = 2.10, p = .04 and F(2, 57) = 4.30, p = .02.",
      [
        comp({ computationCheckId: "c1", claimSpan: "t(28) = 2.10, p = .04" }),
        comp({ computationCheckId: "c2", claimSpan: "F(2, 57) = 4.30, p = .02", outcome: "discrepant" }),
      ],
    );
    expect(link.computationCheckIds).toEqual(["c1", "c2"]);
    expect(link.matchedConsistent).toBe(true);
    expect(link.matchedAdverse).toBe(true);
    expect(link.claimSpan).toBe("t(28) = 2.10, p = .04");
  });

  it("falls back to claimText when no claimSpan is provided", () => {
    const link = linkComputationToClaim(claim, [comp({ claimSpan: undefined })]);
    expect(link.computationCheckIds).toEqual(["c1"]);
  });
});

describe("resolveEvidenceKind", () => {
  it("classifies textual / computational / mixed", () => {
    expect(resolveEvidenceKind({ hasExtract: true, hasComputation: false })).toBe("textual");
    expect(resolveEvidenceKind({ hasExtract: false, hasComputation: false })).toBe("textual");
    expect(resolveEvidenceKind({ hasExtract: false, hasComputation: true })).toBe("computational");
    expect(resolveEvidenceKind({ hasExtract: true, hasComputation: true })).toBe("mixed");
  });
});

describe("computeEvidencePatch", () => {
  it("upgrades support to supported + computational on a consistent recompute", () => {
    const link = linkComputationToClaim("t(28) = 2.10, p = .04", [comp({})]);
    const patch = computeEvidencePatch(link, false);
    expect(patch).toEqual({
      support: "supported",
      confidence: 0.85,
      evidenceKind: "computational",
      computationCheckIds: ["c1"],
      claimSpan: "t(28) = 2.10, p = .04",
    });
  });

  it("marks mixed when a textual extract is also present", () => {
    const link = linkComputationToClaim("t(28) = 2.10, p = .04", [comp({})]);
    expect(computeEvidencePatch(link, true).evidenceKind).toBe("mixed");
  });

  it("does NOT upgrade support on an adverse-only match (neutral framing)", () => {
    const link = linkComputationToClaim("t(28) = 2.10, p = .04", [comp({ outcome: "discrepant" })]);
    const patch = computeEvidencePatch(link, false);
    expect(patch.support).toBeUndefined();
    expect(patch.evidenceKind).toBe("computational");
    expect(patch.computationCheckIds).toEqual(["c1"]);
  });

  it("stays textual with no computation link", () => {
    const link = linkComputationToClaim("qualitative", []);
    const patch = computeEvidencePatch(link, true);
    expect(patch).toEqual({ evidenceKind: "textual", computationCheckIds: undefined, claimSpan: undefined });
  });
});

describe("enforceUnsupportedClaim (agentic-RAG gate)", () => {
  it("fires for an unsupported claim with no extract and no computation", () => {
    expect(enforceUnsupportedClaim({ support: "unsupported" })).toBe(true);
    expect(enforceUnsupportedClaim({ support: "unsupported", extractKeys: [], computationCheckIds: [] })).toBe(true);
  });

  it("does not fire when an extract or computation backs the claim", () => {
    expect(enforceUnsupportedClaim({ support: "unsupported", extractKeys: ["k1"] })).toBe(false);
    expect(enforceUnsupportedClaim({ support: "unsupported", computationCheckIds: ["c1"] })).toBe(false);
  });

  it("does not fire for supported or partial claims", () => {
    expect(enforceUnsupportedClaim({ support: "supported" })).toBe(false);
    expect(enforceUnsupportedClaim({ support: "partially_supported" })).toBe(false);
    expect(enforceUnsupportedClaim({ support: "contradicted" })).toBe(false);
  });
});

describe("auditConcurrencyForAgent", () => {
  it("is Pro=4 / Lite=2 and defaults to pro", () => {
    expect(auditConcurrencyForAgent("pro")).toBe(4);
    expect(auditConcurrencyForAgent("lite")).toBe(2);
    expect(auditConcurrencyForAgent(undefined)).toBe(4);
  });
});

describe("mapWithConcurrency", () => {
  it("preserves input order regardless of completion order", async () => {
    const out = await mapWithConcurrency([3, 1, 2], 2, async (n) => {
      await new Promise((r) => setTimeout(r, n));
      return n * 10;
    });
    expect(out).toEqual([30, 10, 20]);
  });

  it("never exceeds the concurrency limit in flight", async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 10 }, (_, i) => i), 3, async (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
      return n;
    });
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("handles an empty list", async () => {
    expect(await mapWithConcurrency([], 4, async (n) => n)).toEqual([]);
  });
});

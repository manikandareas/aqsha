import { describe, expect, it } from "vitest";
import {
  extractMapKey,
  parseRoundSnapshot,
  rehydrateLoopState,
  type RoundSnapshot,
} from "../convex/agent/research/subagents/loopState";
import type { SourceCandidate } from "../convex/agent/research/sourceCandidates";
import type { ResearchExtract } from "../convex/agent/research/deepResearch";

// Slice 3.1 Task 2: the parity guard. Reconstructing the cross-round loop state
// from persisted rows must reproduce the old in-memory accumulation exactly, or
// the decomposed loop drifts from researchLoop's behavior.

function candidate(sourceKey: string, n: number): SourceCandidate {
  return {
    citationNumber: n,
    sourceKey,
    origin: "web",
    evidenceStrength: "medium",
    title: `Source ${sourceKey}`,
    locator: `https://${sourceKey}.example/x`,
    snippet: "snippet",
  };
}

function extract(sourceKey: string, n: number, quote: string): ResearchExtract {
  return {
    sourceKey,
    citationNumber: n,
    title: `Title ${sourceKey}`,
    locator: `https://${sourceKey}.example/x`,
    quote,
    relevance: "high",
  };
}

describe("rehydrateLoopState parity", () => {
  // The old in-memory accumulation across rounds.
  const acceptedByKey = new Map<string, { source: SourceCandidate }>([
    ["arxiv:1", { source: candidate("arxiv:1", 1) }],
    ["doi:2", { source: candidate("doi:2", 2) }],
    ["web:3", { source: candidate("web:3", 3) }],
  ]);
  const extractsByKey = new Map<string, ResearchExtract>();
  for (const [, { source }] of acceptedByKey) {
    const ex = extract(source.sourceKey!, source.citationNumber, `Evidence for ${source.sourceKey}`);
    extractsByKey.set(extractMapKey(ex), ex);
  }
  const rejected = ["web:bad-1", "web:bad-2"];
  const domainPenalties = new Map<string, number>([
    ["paywall.example", 2],
    ["blocked.example", 1],
  ]);
  const gapAssessment = "Round 2: need RCT evidence for the dosage claim.";
  const sufficiencyStatus = "partial" as const;

  // Persist, then rehydrate.
  const snapshot: RoundSnapshot = {
    domainPenalties: Object.fromEntries(domainPenalties),
    gapAssessment,
    sufficiencyStatus,
  };
  const rehydrated = rehydrateLoopState({
    acceptedSources: [...acceptedByKey.values()].map((v) => v.source),
    rejectedKeys: rejected,
    extracts: [...extractsByKey.values()],
    snapshot,
    initialGapAssessment: "Initial plan",
  });

  it("reconstructs the accepted key set and sources", () => {
    expect(rehydrated.acceptedKeys).toEqual(new Set([...acceptedByKey.keys()]));
    expect(rehydrated.acceptedSources.map((s) => s.sourceKey)).toEqual([
      "arxiv:1",
      "doi:2",
      "web:3",
    ]);
  });

  it("reconstructs the extract map with identical keys + values", () => {
    expect([...rehydrated.extractsByKey.keys()].sort()).toEqual(
      [...extractsByKey.keys()].sort(),
    );
    for (const [key, value] of extractsByKey) {
      expect(rehydrated.extractsByKey.get(key)).toEqual(value);
    }
  });

  it("reconstructs rejected keys, domain penalties, gap, and sufficiency", () => {
    expect(rehydrated.rejectedKeys).toEqual(new Set(rejected));
    expect(Object.fromEntries(rehydrated.domainPenalties)).toEqual({
      "paywall.example": 2,
      "blocked.example": 1,
    });
    expect(rehydrated.gapAssessment).toBe(gapAssessment);
    expect(rehydrated.sufficiencyStatus).toBe("partial");
  });

  it("round 1 (no snapshot) starts from the initial gap and unknown sufficiency", () => {
    const fresh = rehydrateLoopState({
      acceptedSources: [],
      rejectedKeys: [],
      extracts: [],
      snapshot: null,
      initialGapAssessment: "Initial plan: criteria A; B",
    });
    expect(fresh.acceptedKeys.size).toBe(0);
    expect(fresh.gapAssessment).toBe("Initial plan: criteria A; B");
    expect(fresh.sufficiencyStatus).toBe("unknown");
    expect(fresh.domainPenalties.size).toBe(0);
  });
});

describe("parseRoundSnapshot", () => {
  it("extracts the accumulator from a round-end stateJson", () => {
    const stateJson = JSON.stringify({
      sources: [{ title: "x" }],
      readiness: { ready: true },
      accumulator: {
        domainPenalties: { "a.example": 1 },
        gapAssessment: "gap",
        sufficiencyStatus: "sufficient",
      },
    });
    expect(parseRoundSnapshot(stateJson)).toEqual({
      domainPenalties: { "a.example": 1 },
      gapAssessment: "gap",
      sufficiencyStatus: "sufficient",
    });
  });

  it("returns null for missing/malformed json or an absent accumulator", () => {
    expect(parseRoundSnapshot(undefined)).toBeNull();
    expect(parseRoundSnapshot("not json")).toBeNull();
    expect(parseRoundSnapshot(JSON.stringify({ sources: [] }))).toBeNull();
  });

  it("defends against malformed accumulator fields", () => {
    const snap = parseRoundSnapshot(
      JSON.stringify({ accumulator: { domainPenalties: { x: "bad" }, sufficiencyStatus: "nope" } }),
    );
    expect(snap).toEqual({ domainPenalties: {}, gapAssessment: "", sufficiencyStatus: "unknown" });
  });
});

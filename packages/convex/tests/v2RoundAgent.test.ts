/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { buildRoundLoopStateFromRehydrated } from "../convex/agent/research/deepResearch";
import { rehydrateLoopState } from "../convex/agent/research/subagents/loopState";
import { parseBudgetEnvelope } from "../convex/agent/research/subagents/contracts";
import { canonicalSourceKey } from "../convex/agent/research/sourceQuality";
import type { SourceCandidate } from "../convex/agent/research/sourceCandidates";

// Slice R1b: the deterministic data path under the v2 decomposed loop — read-back
// of rejected sources, RoundLoopState reconstruction, synthesis-input rebuild from
// tables (loadRunEvidence), and per-subagent budget folding. The live behavioral
// gate is the R0 smoke on DEEP_RESEARCH_V2=1; these pin the plumbing in CI.

const modules = import.meta.glob("../convex/**/*.ts");
const OWNER = "owner-v2";
const THREAD = "thread-v2";

async function seedRun(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const runId = await ctx.db.insert("agentRuns", {
      ownerUserId: OWNER,
      threadId: THREAD,
      promptMessageId: "m1",
      mode: "deep" as const,
      executionKind: "workflow" as const,
      status: "running" as const,
      budgetJson: JSON.stringify({ maxRounds: 4, model: "deep" }), // legacy v1 shape
      artifactCount: 0,
      sourceCount: 0,
      citationCheckCount: 0,
      retryable: false,
      createdAt: now,
      updatedAt: now,
    });
    // sourceKey is the canonical key derived from the URL (as the real loop stores
    // it), so loadRunEvidence's recomputed key aligns with the extract's key.
    const source = (host: string, n: number, usage: "accepted" | "rejected" | "candidate") => {
      const url = `https://${host}/report-${n}`;
      const key = canonicalSourceKey({ title: `Source ${host}`, locator: url, url });
      return ctx.db
        .insert("researchSources", {
          ownerUserId: OWNER,
          threadId: THREAD,
          runId,
          sourceKey: key,
          usage,
          citationNumber: n,
          origin: "web" as const,
          evidenceStrength: "medium" as const,
          title: `Source ${host}`,
          locator: url,
          url,
          snippet: "snippet",
          createdAt: now,
        })
        .then(() => key);
    };
    // Two accepted, one rejected (real domain), one candidate (ignored).
    const acceptedKeyA = await source("alpha.example", 1, "accepted");
    await source("beta.example", 2, "accepted");
    await source("paywall.example", 0, "rejected");
    await source("cand.example", 0, "candidate");
    await ctx.db.insert("researchExtracts", {
      ownerUserId: OWNER,
      threadId: THREAD,
      runId,
      sourceKey: acceptedKeyA,
      citationNumber: 1,
      title: "Title alpha",
      locator: "https://alpha.example/report-1",
      quote: "Evidence for alpha",
      relevance: "high" as const,
      createdAt: now,
    });
    // One completed round, one planned (must be excluded from the trace).
    await ctx.db.insert("researchRoundStates", {
      ownerUserId: OWNER,
      threadId: THREAD,
      runId,
      round: 1,
      status: "completed" as const,
      query: "q1",
      gapAssessment: "Need more RCTs.",
      sufficiencyStatus: "partial" as const,
      sourceCount: 2,
      extractCount: 1,
      stateJson: JSON.stringify({
        accumulator: {
          domainPenalties: { "paywall.example": 2 },
          gapAssessment: "Need more RCTs.",
          sufficiencyStatus: "partial",
        },
      }),
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("researchRoundStates", {
      ownerUserId: OWNER,
      threadId: THREAD,
      runId,
      round: 2,
      status: "planned" as const,
      query: "q2",
      gapAssessment: "",
      sufficiencyStatus: "unknown" as const,
      sourceCount: 0,
      extractCount: 0,
      stateJson: JSON.stringify({}),
      createdAt: now,
      updatedAt: now,
    });
    return runId as Id<"agentRuns">;
  });
}

describe("listRunSourceState (rejected sources)", () => {
  it("returns full rejected candidates plus their keys for round-≥2 domain biasing", async () => {
    const t = convexTest(schema, modules);
    const runId = await seedRun(t);
    const state = await t.query(internal.agent.research.subagents.runState.listRunSourceState, {
      ownerUserId: OWNER,
      runId,
    });
    expect(state.accepted).toHaveLength(2);
    expect(state.rejectedKeys).toHaveLength(1);
    expect(state.rejected).toHaveLength(1);
    expect(state.rejected[0].url).toBe("https://paywall.example/report-0");
  });
});

describe("loadRunEvidence", () => {
  it("rebuilds numbered sources, aligned extracts, and the completed-round trace", async () => {
    const t = convexTest(schema, modules);
    const runId = await seedRun(t);
    const evidence = await t.query(internal.agent.research.deepResearch.loadRunEvidence, {
      ownerUserId: OWNER,
      runId,
    });
    // Only accepted sources, numbered sequentially in creation order.
    expect(evidence.sources).toHaveLength(2);
    expect(evidence.sources.map((s) => s.citationNumber)).toEqual([1, 2]);
    // The extract is for the first-created accepted source (alpha → citation 1),
    // proving extract citation numbers realign to the rebuilt source numbering.
    expect(evidence.extracts).toHaveLength(1);
    expect(evidence.extracts[0].citationNumber).toBe(1);
    // Only the completed round appears in the trace.
    expect(evidence.roundState).toHaveLength(1);
    expect(evidence.roundState[0]).toMatchObject({
      round: 1,
      sufficiencyStatus: "partial",
    });
    expect(evidence.roundState[0].stopReason).toBeUndefined();
  });
});

describe("updateBudget folding", () => {
  it("upgrades a legacy budgetJson and accumulates per-subagent deltas", async () => {
    const t = convexTest(schema, modules);
    const runId = await seedRun(t);
    await t.mutation(internal.agent.research.subagents.runState.updateBudget, {
      runId,
      ownerUserId: OWNER,
      subagent: "literatureRound",
      delta: { tokens: 1500, providerCalls: 1 },
    });
    await t.mutation(internal.agent.research.subagents.runState.updateBudget, {
      runId,
      ownerUserId: OWNER,
      subagent: "literatureRound",
      delta: { tokens: 500, providerCalls: 1 },
    });
    await t.mutation(internal.agent.research.subagents.runState.updateBudget, {
      runId,
      ownerUserId: OWNER,
      subagent: "counterEvidence",
      delta: { tokens: 800, providerCalls: 1 },
    });
    const run = await t.run((ctx) => ctx.db.get("agentRuns", runId));
    const env = parseBudgetEnvelope(run?.budgetJson);
    expect(env.perSubagent.literatureRound).toEqual({ tokens: 2000, providerCalls: 2 });
    expect(env.perSubagent.counterEvidence).toEqual({ tokens: 800, providerCalls: 1 });
    expect(env.totals).toEqual({ tokens: 2800, providerCalls: 3 });
  });
});

describe("buildRoundLoopStateFromRehydrated", () => {
  it("reconstructs accepted/rejected entries with an empty candidate pool", () => {
    const accepted: SourceCandidate[] = [
      {
        citationNumber: 1,
        sourceKey: "arxiv:1",
        origin: "web",
        evidenceStrength: "medium",
        title: "A",
        locator: "https://a.example/x",
        url: "https://a.example/x",
        snippet: "s",
      },
    ];
    const rejected: SourceCandidate[] = [
      {
        citationNumber: 0,
        sourceKey: "paywall:bad",
        origin: "web",
        evidenceStrength: "weak",
        title: "Bad",
        locator: "https://paywall.example/x",
        url: "https://paywall.example/x",
        snippet: "s",
      },
    ];
    const rehydrated = rehydrateLoopState({
      acceptedSources: accepted,
      rejectedKeys: ["paywall:bad"],
      rejectedSources: rejected,
      extracts: [],
      snapshot: { domainPenalties: { "x.example": 1 }, gapAssessment: "gap", sufficiencyStatus: "partial" },
      initialGapAssessment: "init",
    });
    const state = buildRoundLoopStateFromRehydrated([], rehydrated);
    expect(state.acceptedByKey.size).toBe(1);
    expect([...state.acceptedByKey.values()][0].source.sourceKey).toBe("arxiv:1");
    expect(state.rejected).toHaveLength(1);
    expect(state.rejected[0].source.url).toBe("https://paywall.example/x");
    expect(state.candidatePool.size).toBe(0);
    expect(state.gapAssessment).toBe("gap");
    expect(state.sufficiencyStatus).toBe("partial");
    expect(Object.fromEntries(state.domainPenalties)).toEqual({ "x.example": 1 });
  });
});

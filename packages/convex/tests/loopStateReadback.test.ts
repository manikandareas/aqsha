/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { rehydrateLoopState, extractMapKey } from "../convex/agent/research/subagents/loopState";

// Slice 3.1 Task 2: end-to-end rehydration data path — persisted rows -> read-back
// queries -> pure rehydrateLoopState reproduces the cross-round accumulation.

const modules = import.meta.glob("../convex/**/*.ts");
const OWNER = "owner-loopstate";
const THREAD = "thread-loopstate";

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
      artifactCount: 0,
      sourceCount: 0,
      citationCheckCount: 0,
      retryable: false,
      createdAt: now,
      updatedAt: now,
    });
    const source = (sourceKey: string, n: number, usage: "accepted" | "rejected" | "candidate") =>
      ctx.db.insert("researchSources", {
        ownerUserId: OWNER,
        threadId: THREAD,
        runId,
        sourceKey,
        usage,
        citationNumber: n,
        origin: "web" as const,
        evidenceStrength: "medium" as const,
        title: `Source ${sourceKey}`,
        locator: `https://${sourceKey}.example/x`,
        snippet: "snippet",
        createdAt: now,
      });
    await source("arxiv:1", 1, "accepted");
    await source("doi:2", 2, "accepted");
    await source("web:bad", 0, "rejected");
    await source("web:cand", 0, "candidate"); // must be ignored
    await ctx.db.insert("researchExtracts", {
      ownerUserId: OWNER,
      threadId: THREAD,
      runId,
      sourceKey: "arxiv:1",
      citationNumber: 1,
      title: "Title arxiv:1",
      locator: "https://arxiv:1.example/x",
      quote: "Evidence for arxiv:1",
      relevance: "high" as const,
      createdAt: now,
    });
    await ctx.db.insert("researchRoundStates", {
      ownerUserId: OWNER,
      threadId: THREAD,
      runId,
      round: 1,
      status: "completed" as const,
      query: "q",
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
    return runId as Id<"agentRuns">;
  });
}

describe("loop-state read-back -> rehydrate", () => {
  it("reads accepted/rejected sources, extracts, and the round snapshot", async () => {
    const t = convexTest(schema, modules);
    const runId = await seedRun(t);

    const sourceState = await t.query(internal.agent.research.subagents.runState.listRunSourceState, {
      ownerUserId: OWNER,
      runId,
    });
    expect(sourceState.accepted.map((s) => s.sourceKey).sort()).toEqual(["arxiv:1", "doi:2"]);
    expect(sourceState.rejectedKeys).toEqual(["web:bad"]);

    const extracts = await t.query(internal.agent.research.subagents.runState.listExtractsForRun, {
      ownerUserId: OWNER,
      runId,
    });
    expect(extracts).toHaveLength(1);

    const snapshot = await t.query(internal.agent.research.subagents.runState.getLatestRoundSnapshot, {
      ownerUserId: OWNER,
      runId,
    });
    expect(snapshot).toEqual({
      domainPenalties: { "paywall.example": 2 },
      gapAssessment: "Need more RCTs.",
      sufficiencyStatus: "partial",
    });

    // The whole point: feed the read-back into the pure rehydrator.
    const state = rehydrateLoopState({
      acceptedSources: sourceState.accepted,
      rejectedKeys: sourceState.rejectedKeys,
      extracts,
      snapshot,
      initialGapAssessment: "Initial",
    });
    expect(state.acceptedKeys).toEqual(new Set(["arxiv:1", "doi:2"]));
    expect(state.rejectedKeys).toEqual(new Set(["web:bad"]));
    expect(state.extractsByKey.has(extractMapKey(extracts[0]))).toBe(true);
    expect(Object.fromEntries(state.domainPenalties)).toEqual({ "paywall.example": 2 });
    expect(state.gapAssessment).toBe("Need more RCTs.");
    expect(state.sufficiencyStatus).toBe("partial");
  });
});

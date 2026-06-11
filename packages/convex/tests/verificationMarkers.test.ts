/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import {
  appendVerificationCaveat,
  buildVerificationCaveat,
  parseVerificationMarkers,
} from "../convex/agent/research/subagents/runState";

// Slice R1c: non-fatal verifiers append a degradation marker (never throw); the
// integrity summary feeds the writer. Both are read-modify-write on the run row.

const modules = import.meta.glob("../convex/**/*.ts");
const OWNER = "owner-marker";
const THREAD = "thread-marker";

async function seedRun(t: ReturnType<typeof convexTest>): Promise<Id<"agentRuns">> {
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
    return runId as Id<"agentRuns">;
  });
}

describe("parseVerificationMarkers", () => {
  it("tolerates missing / malformed json", () => {
    expect(parseVerificationMarkers(undefined)).toEqual([]);
    expect(parseVerificationMarkers("not json")).toEqual([]);
    expect(parseVerificationMarkers(JSON.stringify({ not: "an array" }))).toEqual([]);
    expect(parseVerificationMarkers(JSON.stringify([{ marker: "x", reason: "y" }, { bad: 1 }]))).toEqual([
      { marker: "x", reason: "y" },
    ]);
  });
});

describe("verification caveat", () => {
  it("is empty when there are no markers", () => {
    expect(buildVerificationCaveat([])).toBe("");
    expect(appendVerificationCaveat("# Report", [])).toBe("# Report");
  });

  it("renders a deduped, human-readable caveat and appends it to the report", () => {
    const markers = [
      { marker: "verification_incomplete", reason: "citation_rate_limited" },
      { marker: "verification_incomplete", reason: "citation_rate_limited" },
      { marker: "verification_incomplete", reason: "statistical_failed" },
    ];
    const caveat = buildVerificationCaveat(markers);
    expect(caveat).toContain("tidak lengkap");
    expect(caveat).toContain("rate limit");
    expect(caveat).toContain("verifikasi statistik gagal");
    const appended = appendVerificationCaveat("# Report\n\nBody.", markers);
    expect(appended.startsWith("# Report")).toBe(true);
    expect(appended).toContain("Catatan verifikasi");
  });
});

describe("setVerificationMarker", () => {
  it("appends markers idempotently and reads them back", async () => {
    const t = convexTest(schema, modules);
    const runId = await seedRun(t);
    await t.mutation(internal.agent.research.subagents.runState.setVerificationMarker, {
      runId,
      ownerUserId: OWNER,
      marker: "verification_incomplete",
      reason: "citation_rate_limited",
    });
    await t.mutation(internal.agent.research.subagents.runState.setVerificationMarker, {
      runId,
      ownerUserId: OWNER,
      marker: "verification_incomplete",
      reason: "statistical_failed",
    });
    const markers = await t.query(internal.agent.research.subagents.runState.getVerificationMarkers, {
      runId,
      ownerUserId: OWNER,
    });
    expect(markers).toEqual([
      { marker: "verification_incomplete", reason: "citation_rate_limited" },
      { marker: "verification_incomplete", reason: "statistical_failed" },
    ]);
  });
});

describe("getRunIntegritySummary", () => {
  it("summarizes flagged accepted sources and counts verified ones", async () => {
    const t = convexTest(schema, modules);
    const runId = await seedRun(t);
    await t.run(async (ctx) => {
      const now = Date.now();
      const insert = (
        citationNumber: number,
        usage: "accepted" | "rejected",
        integrityStatus?: "verified" | "metadata_mismatch" | "not_found" | "unverifiable",
      ) =>
        ctx.db.insert("researchSources", {
          ownerUserId: OWNER,
          threadId: THREAD,
          runId,
          sourceKey: `k${citationNumber}`,
          usage,
          citationNumber,
          origin: "web" as const,
          evidenceStrength: "medium" as const,
          title: `S${citationNumber}`,
          locator: `https://s${citationNumber}.example/x`,
          snippet: "s",
          integrityStatus,
          createdAt: now,
        });
      await insert(1, "accepted", "verified");
      await insert(2, "accepted", "metadata_mismatch");
      await insert(3, "accepted", "not_found");
      await insert(4, "accepted", "unverifiable"); // not counted as flagged
      await insert(5, "rejected", "not_found"); // ignored (rejected)
    });
    const summary = await t.query(internal.agent.research.deepResearch.getRunIntegritySummary, {
      ownerUserId: OWNER,
      runId,
    });
    expect(summary.verifiedCount).toBe(1);
    expect(summary.flaggedCount).toBe(2);
    expect(summary.note).toContain("[2] metadata_mismatch");
    expect(summary.note).toContain("[3] not_found");
  });
});

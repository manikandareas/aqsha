/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { afterEach, describe, expect, it, vi } from "vitest";
import { internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

// Slice R0: the dev harness must be (1) un-callable without the
// AQSHA_DEV_HARNESS=1 env flag (structured error — never live on prod), and
// (2) return a stable status shape the smoke driver can poll against.

const modules = import.meta.glob("../convex/**/*.ts");
const OWNER = "owner-harness";
const THREAD = "thread-harness";

afterEach(() => {
  vi.unstubAllEnvs();
});

async function seedRun(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const now = 1_000;
    const artifactId = await ctx.db.insert("artifacts", {
      ownerUserId: OWNER,
      threadId: THREAD,
      title: "Laporan riset",
      createdAt: now,
      updatedAt: now,
    });
    const artifactVersionId = await ctx.db.insert("artifactVersions", {
      ownerUserId: OWNER,
      threadId: THREAD,
      artifactId,
      versionNumber: 1,
      contentFormat: "markdown",
      title: "Laporan riset",
      body: "# Laporan",
      createdAt: now,
    });
    const runId = await ctx.db.insert("agentRuns", {
      ownerUserId: OWNER,
      threadId: THREAD,
      promptMessageId: "m-1",
      mode: "deep",
      agentKind: "pro",
      executionKind: "workflow",
      status: "completed",
      roundCount: 2,
      maxRounds: 4,
      sufficiencyStatus: "sufficient",
      verificationStatus: "passed",
      budgetJson: JSON.stringify({ maxRounds: 4 }),
      draftMarkdown: "# Draft",
      verificationReportJson: JSON.stringify({ checks: [] }),
      activeArtifactId: artifactId,
      artifactCount: 1,
      sourceCount: 5,
      citationCheckCount: 1,
      retryable: false,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("agentRunSteps", {
      ownerUserId: OWNER,
      runId,
      stepKey: "planRound",
      label: "Merencanakan ronde",
      order: 0,
      status: "completed",
      updatedAt: now,
    });
    await ctx.db.insert("agentRunEvents", {
      ownerUserId: OWNER,
      runId,
      threadId: THREAD,
      stepKey: "planRound",
      eventType: "plan",
      title: "Plan",
      summary: "Rencana riset",
      createdAt: now,
    });
    await ctx.db.insert("agentRunEvents", {
      ownerUserId: OWNER,
      runId,
      threadId: THREAD,
      stepKey: "planRound",
      eventType: "status",
      title: "Status",
      summary: "Selesai",
      createdAt: now + 1,
    });
    await ctx.db.insert("citationChecks", {
      ownerUserId: OWNER,
      threadId: THREAD,
      runId,
      artifactId,
      artifactVersionId,
      claim: "Klaim utama",
      support: "supported",
      sourceIds: [],
      evidence: "Bukti",
      createdAt: now,
    });
    const sandboxRunId = await ctx.db.insert("sandboxRuns", {
      ownerUserId: OWNER,
      threadId: THREAD,
      runId,
      taskKind: "stat_verification",
      status: "completed",
      snapshotVersion: "aqsha-statverify-v1",
      command: "statcheck",
      inputFileHashes: [],
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("computationChecks", {
      ownerUserId: OWNER,
      sandboxRunId,
      artifactId,
      checkKind: "statcheck",
      claimText: "t(28)=2.1, p=.04",
      reportedJson: "{}",
      recomputedJson: "{}",
      outcome: "consistent",
      toleranceJson: "{}",
      createdAt: now,
    });
    return { runId, artifactId };
  });
}

describe("dev harness env guard", () => {
  it("rejects every harness entrypoint with a structured error when the flag is off", async () => {
    vi.stubEnv("AQSHA_DEV_HARNESS", "");
    const t = convexTest(schema, modules);
    const { runId } = await seedRun(t);
    for (const call of [
      () => t.query(internal.agent.evals.devHarness.getSmokeStatus, { ownerUserId: OWNER, runId }),
      () => t.mutation(internal.agent.evals.devHarness.cancelSmokeRun, { ownerUserId: OWNER, runId }),
      () =>
        t.mutation(internal.agent.evals.devHarness.beginSmokeResume, {
          ownerUserId: OWNER,
          threadId: THREAD,
          promptMessageId: "m-1",
        }),
    ]) {
      let thrown: unknown;
      try {
        await call();
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(ConvexError);
      expect((thrown as ConvexError<{ code: string }>).data.code).toBe("dev_harness_disabled");
    }
  });
});

describe("getSmokeStatus", () => {
  it("returns the bounded status shape the smoke driver asserts on", async () => {
    vi.stubEnv("AQSHA_DEV_HARNESS", "1");
    const t = convexTest(schema, modules);
    const { runId, artifactId } = await seedRun(t);
    const status = await t.query(internal.agent.evals.devHarness.getSmokeStatus, {
      ownerUserId: OWNER,
      runId,
    });
    expect(status).not.toBeNull();
    expect(status).toMatchObject({
      status: "completed",
      roundCount: 2,
      maxRounds: 4,
      sourceCount: 5,
      artifactCount: 1,
      citationCheckCount: 1,
      sufficiencyStatus: "sufficient",
      verificationStatus: "passed",
      draftMarkdown: true,
      verificationReport: true,
      artifactId,
      eventCount: 2,
      computationCheckCount: 1,
      citationStatuses: ["supported"],
    });
    expect(status?.steps).toEqual([
      { stepKey: "planRound", status: "completed", summary: null },
    ]);
    expect(status?.stepEvents).toEqual({
      planRound: { count: 2, eventTypes: ["plan", "status"] },
    });
    expect(JSON.parse(status?.budgetJson ?? "null")).toEqual({ maxRounds: 4 });
  });

  it("returns null for a non-owner read", async () => {
    vi.stubEnv("AQSHA_DEV_HARNESS", "1");
    const t = convexTest(schema, modules);
    const { runId } = await seedRun(t);
    const status = await t.query(internal.agent.evals.devHarness.getSmokeStatus, {
      ownerUserId: "someone-else",
      runId: runId as Id<"agentRuns">,
    });
    expect(status).toBeNull();
  });
});

/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../convex/schema";
import {
  hasActiveReplyRun,
  hasOtherActiveReplyRun,
  isActiveRunStatus,
} from "../convex/agent/runLifecycle";

// AUD-07: active/waiting detection is index-driven (by_owner_thread_status) and
// counts waiting/waiting_hitl, so a paused run blocks a concurrent reply and an
// older active run is never dropped by the old take(8) ring-buffer scan.

const modules = import.meta.glob("../convex/**/*.ts");
const OWNER = "owner-lifecycle";
const THREAD = "thread-lifecycle";

type RunStatus = Parameters<typeof isActiveRunStatus>[0];

function runDoc(status: RunStatus, createdAt: number) {
  return {
    ownerUserId: OWNER,
    threadId: THREAD,
    promptMessageId: `m-${createdAt}`,
    mode: "normal" as const,
    executionKind: "inline" as const,
    status,
    artifactCount: 0,
    sourceCount: 0,
    citationCheckCount: 0,
    retryable: false,
    createdAt,
    updatedAt: createdAt,
  };
}

describe("isActiveRunStatus", () => {
  it("counts in-flight states (incl. both waiting variants) as active", () => {
    expect(isActiveRunStatus("queued")).toBe(true);
    expect(isActiveRunStatus("running")).toBe(true);
    expect(isActiveRunStatus("waiting")).toBe(true);
    expect(isActiveRunStatus("waiting_hitl")).toBe(true);
    expect(isActiveRunStatus("completed")).toBe(false);
    expect(isActiveRunStatus("failed")).toBe(false);
    expect(isActiveRunStatus("canceled")).toBe(false);
  });
});

describe("hasActiveReplyRun (index-driven)", () => {
  it("a paused (waiting_hitl) run counts as active", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("agentRuns", runDoc("completed", 1));
      await ctx.db.insert("agentRuns", runDoc("waiting_hitl", 2));
    });
    const active = await t.run((ctx) => hasActiveReplyRun(ctx, { ownerUserId: OWNER, threadId: THREAD }));
    expect(active).toBe(true);
  });

  it("all-terminal runs report no active reply", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("agentRuns", runDoc("completed", 1));
      await ctx.db.insert("agentRuns", runDoc("failed", 2));
      await ctx.db.insert("agentRuns", runDoc("canceled", 3));
    });
    const active = await t.run((ctx) => hasActiveReplyRun(ctx, { ownerUserId: OWNER, threadId: THREAD }));
    expect(active).toBe(false);
  });

  it("does NOT drop an old active run behind newer terminal ones (take(8) regression)", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      // The oldest run is the active one; 10 newer terminal runs would have
      // pushed it out of an order-desc take(8) window.
      await ctx.db.insert("agentRuns", runDoc("running", 1));
      for (let i = 2; i <= 11; i++) {
        await ctx.db.insert("agentRuns", runDoc("completed", i));
      }
    });
    const active = await t.run((ctx) => hasActiveReplyRun(ctx, { ownerUserId: OWNER, threadId: THREAD }));
    expect(active).toBe(true);
  });
});

describe("hasOtherActiveReplyRun", () => {
  it("ignores the given run but sees another active run", async () => {
    const t = convexTest(schema, modules);
    const selfId = await t.run((ctx) => ctx.db.insert("agentRuns", runDoc("running", 1)));
    let other = await t.run((ctx) =>
      hasOtherActiveReplyRun(ctx, { ownerUserId: OWNER, threadId: THREAD, runId: selfId }),
    );
    expect(other).toBe(false);

    await t.run((ctx) => ctx.db.insert("agentRuns", runDoc("queued", 2)));
    other = await t.run((ctx) =>
      hasOtherActiveReplyRun(ctx, { ownerUserId: OWNER, threadId: THREAD, runId: selfId }),
    );
    expect(other).toBe(true);
  });
});

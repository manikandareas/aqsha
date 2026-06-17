/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");

// Expected stagger (ms) per lane, mirroring HYDRATE_STAGGER in feed.ts. The
// backfillIndonesian lane is intentionally absent for now.
const EXPECTED: Array<{ needle: string; delayMs: number }> = [
  { needle: "refreshTrendingPapers", delayMs: 0 },
  { needle: "refreshTrendingTopics", delayMs: 20 * 60_000 },
  { needle: "refreshGoogleNews", delayMs: 40 * 60_000 },
  { needle: "refreshFactCheckClaims", delayMs: 60 * 60_000 },
  { needle: "enrichGoogleNewsArticles", delayMs: 100 * 60_000 },
];

describe("feed hydration orchestrator (hydrateCycle)", () => {
  it("schedules the five feed lanes with staggered delays and no inline await", async () => {
    const t = convexTest(schema, modules);

    const startedAt = Date.now();
    const result = await t.action(internal.feed.hydrateCycle, {});
    // The orchestrator only schedules — it never awaits the children, so it
    // returns immediately with the scheduled count.
    expect(result).toEqual({ scheduled: 5 });

    const jobs = await t.run(async (ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    // runAfter(0) jobs stay pending in convex-test, so all five are observable
    // (and none have actually executed — no network calls fire in this test).
    expect(jobs).toHaveLength(5);

    for (const { needle, delayMs } of EXPECTED) {
      const job = jobs.find((j) => j.name.includes(needle));
      expect(job, `missing scheduled lane: ${needle}`).toBeDefined();
      const offset = job!.scheduledTime - startedAt;
      expect(offset).toBeGreaterThanOrEqual(delayMs);
      expect(offset).toBeLessThan(delayMs + 10_000);
    }

    // The Bahasa Indonesia backfill lane is deliberately not scheduled for now.
    expect(jobs.some((j) => j.name.includes("backfillIndonesian"))).toBe(false);
  });
});

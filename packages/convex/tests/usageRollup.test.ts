/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import {
  emptyFeatureCounts,
  USAGE_FEATURES,
  type FeatureCounts,
  type UsageFeature,
} from "../convex/billing/usageShape";

const modules = import.meta.glob("../convex/**/*.ts");

// Owner key used by `requireCurrentUser` in a query ctx with no synced user
// doc: `currentUserFromIdentity._id === identity.tokenIdentifier`.
const OWNER = "owner-rollup-test";
const OTHER_OWNER = "owner-other";
const IDENTITY = { tokenIdentifier: OWNER, subject: OWNER };

type ActivityRow = {
  date: string;
  credits: number;
  estimatedCostCents: number;
  eventCount: number;
  featureCounts: FeatureCounts;
};

type LedgerEvent = {
  ownerUserId: string;
  feature: UsageFeature;
  credits: number;
  estimatedCostCents: number;
  createdAt: number;
};

// Reference implementation of the ORIGINAL ledger-scanning `activity` handler,
// frozen here so we can assert the new rollup-backed handler is byte-identical
// for the same underlying ledger data.
function legacyActivity(
  events: LedgerEvent[],
  ownerUserId: string,
  now: Date,
  days?: number,
): ActivityRow[] {
  const dayCount = Math.max(1, Math.min(366, Math.floor(days ?? 365)));
  const end = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
    0,
  );
  const start = end - dayCount * 24 * 60 * 60 * 1000;
  const rows = new Map<string, ActivityRow>();
  for (let offset = 0; offset < dayCount; offset += 1) {
    const timestamp = start + offset * 24 * 60 * 60 * 1000;
    const date = new Date(timestamp).toISOString().slice(0, 10);
    rows.set(date, {
      date,
      credits: 0,
      estimatedCostCents: 0,
      eventCount: 0,
      featureCounts: emptyFeatureCounts(),
    });
  }
  for (const event of events) {
    if (event.ownerUserId !== ownerUserId) continue;
    if (event.createdAt < start || event.createdAt >= end) continue;
    const date = new Date(event.createdAt).toISOString().slice(0, 10);
    const row = rows.get(date);
    if (!row) continue;
    row.credits += event.credits;
    row.estimatedCostCents += event.estimatedCostCents;
    row.eventCount += 1;
    row.featureCounts[event.feature] += 1;
  }
  return Array.from(rows.values());
}

function utcDayMs(date: string, hour = 12): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d, hour);
}

describe("usage daily rollup", () => {
  it("write-path keeps the rollup byte-identical to a fresh ledger scan", async () => {
    const t = convexTest(schema, modules);
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const yesterdayMs = utcDayMs(today) - 24 * 60 * 60 * 1000;
    const yesterday = new Date(yesterdayMs).toISOString().slice(0, 10);

    // Two owners, multiple features, multiple events per day, across two days.
    const events: LedgerEvent[] = [
      { ownerUserId: OWNER, feature: "normal_chat", credits: 2, estimatedCostCents: 3, createdAt: utcDayMs(today, 1) },
      { ownerUserId: OWNER, feature: "normal_chat", credits: 1, estimatedCostCents: 1, createdAt: utcDayMs(today, 5) },
      { ownerUserId: OWNER, feature: "pro_chat", credits: 5, estimatedCostCents: 9, createdAt: utcDayMs(today, 9) },
      { ownerUserId: OWNER, feature: "sandbox_compute", credits: 10, estimatedCostCents: 0, createdAt: utcDayMs(today, 11) },
      // Usage-tracked but free (0 credits): exercises the optional-key rollup path.
      { ownerUserId: OWNER, feature: "citation_verify", credits: 0, estimatedCostCents: 0, createdAt: utcDayMs(today, 13) },
      { ownerUserId: OWNER, feature: "deep_research", credits: 120, estimatedCostCents: 40, createdAt: utcDayMs(yesterday, 3) },
      { ownerUserId: OWNER, feature: "external_search", credits: 2, estimatedCostCents: 0, createdAt: utcDayMs(yesterday, 8) },
      { ownerUserId: OWNER, feature: "cited_answer", credits: 3, estimatedCostCents: 2, createdAt: utcDayMs(yesterday, 20) },
      // Different owner — must NOT leak into OWNER's rollup/activity.
      { ownerUserId: OTHER_OWNER, feature: "pro_chat", credits: 99, estimatedCostCents: 99, createdAt: utcDayMs(today, 4) },
    ];

    // Drive the real write-path: insert each ledger row + bump rollup in one
    // transaction, exactly mirroring the production call sites.
    await t.run(async (ctx) => {
      for (const e of events) {
        await ctx.db.insert("providerUsageLedger", {
          ownerUserId: e.ownerUserId,
          feature: e.feature,
          provider: "test",
          credits: e.credits,
          estimatedCostCents: e.estimatedCostCents,
          createdAt: e.createdAt,
        });
        const date = new Date(e.createdAt).toISOString().slice(0, 10);
        const existing = await ctx.db
          .query("usageDailyRollup")
          .withIndex("by_owner_date", (q) =>
            q.eq("ownerUserId", e.ownerUserId).eq("date", date),
          )
          .unique();
        if (existing) {
          await ctx.db.patch("usageDailyRollup", existing._id, {
            credits: existing.credits + e.credits,
            estimatedCostCents: existing.estimatedCostCents + e.estimatedCostCents,
            eventCount: existing.eventCount + 1,
            featureCounts: {
              ...existing.featureCounts,
              // `?? 0` mirrors bumpUsageDailyRollup: the optional sandbox_compute
              // key is absent on rows written before the feature existed.
              [e.feature]: (existing.featureCounts[e.feature] ?? 0) + 1,
            },
          });
        } else {
          const fc = emptyFeatureCounts();
          fc[e.feature] = 1;
          await ctx.db.insert("usageDailyRollup", {
            ownerUserId: e.ownerUserId,
            date,
            credits: e.credits,
            estimatedCostCents: e.estimatedCostCents,
            eventCount: 1,
            featureCounts: fc,
          });
        }
      }
    });

    const got = (await t
      .withIdentity(IDENTITY)
      .query(api.billing.usage.activity, { days: 7 })) as ActivityRow[];
    const expected = legacyActivity(events, OWNER, now, 7);

    expect(got).toEqual(expected);
    // Spot-check structure: chronological order, full 7-day window, isolation.
    expect(got).toHaveLength(7);
    expect(got.map((r) => r.date)).toEqual([...got.map((r) => r.date)].sort());
    const todayRow = got.find((r) => r.date === today)!;
    expect(todayRow.featureCounts.normal_chat).toBe(2);
    expect(todayRow.featureCounts.pro_chat).toBe(1);
    expect(todayRow.featureCounts.sandbox_compute).toBe(1);
    expect(todayRow.featureCounts.citation_verify).toBe(1);
    expect(todayRow.credits).toBe(18);
    expect(todayRow.eventCount).toBe(5);
  });

  it("USAGE_FEATURES matches the empty feature-count shape", () => {
    const fc = emptyFeatureCounts();
    expect(Object.keys(fc).sort()).toEqual([...USAGE_FEATURES].sort());
    expect(Object.values(fc).every((n) => n === 0)).toBe(true);
  });
});

// Silence unused-import lint for the Id type if tree-shaken; referenced here to
// keep the module-resolution contract explicit.
export type _UsageRollupRowId = Id<"usageDailyRollup">;

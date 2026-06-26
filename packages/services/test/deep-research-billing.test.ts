/**
 * Slice 7.5 — billing untuk `/deep`. Dua lapis:
 *
 *  A. service-unit (spyOn namespace, no db): `SendQuotaService.check(feature:
 *     'deep_research')` = pre-check ramah composer (notice cap deep). Buktikan
 *     feature dipropagasi ke entitlement + blok deep TAK membakar jatah cooldown.
 *  B. DB-itest (prefix `itdeep_`, di luar broad cleanup `user_itest_%`): jalur
 *     billing yang dipakai `propose_research_plan.execute` saat user approve —
 *     `consumeCredits(feature:'deep_research')` idempoten (resume eve tak
 *     double-charge) + cap bulanan `deepResearchRuns` memblok run berikut TANPA
 *     debit tambahan.
 *
 * Keputusan scope B: `propose_research_plan.execute` TAK di-import langsung —
 * tool ada di apps/web (impor `eve/tools`, di luar `test:v2`; bukan dep
 * @aqsha/services). Tool = passthrough tipis ke BillingService; dua perilakunya
 * (gate-block tanpa consume + idempoten key `thread:turn:deep`) terbukti penuh di
 * itest `consumeCredits(deep_research)` + unit SendQuotaService di bawah, dan
 * `evaluateGate(deepLimitReached)→quota_exceeded` (pure) sudah di billing.test.ts.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { BillingRepo, createDb } from "@aqsha/db";
import { users } from "@aqsha/db/schema";
import { BillingService } from "../src/billing.service";
import { currentMonthPeriod } from "../src/plan";
import { SendQuotaService } from "../src/quota/send-quota.service";
import * as rlMod from "../src/quota/rate-limits";

const fakeDb = { transaction: async (fn: (tx: unknown) => unknown) => fn(fakeDb) } as never;
const OWNER = "user_1";

// ── A. SendQuotaService.check(feature: deep_research) ────────────────────────
describe("SendQuotaService.check — deep_research pre-check", () => {
  let limiter: { consume: (k: string) => Promise<unknown>; get: (k: string) => Promise<unknown> };
  let ent: ReturnType<typeof spyOn>;
  beforeEach(() => {
    limiter = { consume: async () => ({}), get: async () => null };
    spyOn(rlMod, "getRateLimiter").mockReturnValue(limiter as never);
    ent = spyOn(BillingService, "requireEntitlement");
  });
  afterEach(() => mock.restore());

  test("deep ok → check ok; entitlement dipanggil feature=deep_research, requiredPlan=free", async () => {
    ent.mockResolvedValue({ ok: true } as never);
    const r = await SendQuotaService.check(fakeDb, { ownerUserId: OWNER, feature: "deep_research" });
    expect(r.ok).toBe(true);
    const arg = ent.mock.calls[0]![1] as { feature: string; requiredPlan?: string };
    expect(arg.feature).toBe("deep_research");
    expect(arg.requiredPlan).toBe("free"); // Lite-deep pakai kuota bulanan, bukan subscription_required
  });

  test("cap deep tercapai → quota_exceeded; TAK sentuh cooldown", async () => {
    let consumed = false;
    limiter.consume = async () => {
      consumed = true;
      return {};
    };
    ent.mockResolvedValue({ ok: false, reason: "quota_exceeded", resetAt: 5555 } as never);
    const r = await SendQuotaService.check(fakeDb, { ownerUserId: OWNER, feature: "deep_research" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("quota_exceeded");
      expect(r.retryAt).toBe(5555);
    }
    expect(consumed).toBe(false);
  });
});

// ── B. consumeCredits(deep_research) idempotency + cap (DB-itest) ─────────────
const DATABASE_URL = process.env.DATABASE_URL;
const itest = DATABASE_URL ? test : test.skip;
const SUFFIX = Math.floor(Math.random() * 1e9);
const { db, client } = createDb(DATABASE_URL ?? "postgresql://x");

let seq = 0;
async function starterOwner(): Promise<string> {
  const owner = `itdeep_${SUFFIX}_${seq++}`;
  if (!DATABASE_URL) return owner;
  await db.insert(users).values({ ownerUserId: owner, clerkUserId: owner, createdAt: 1, updatedAt: 1 });
  // Starter sub: limit 500 (≫ 3×60 deep lite) → run ke-4 ditolak oleh cap, bukan saldo.
  await BillingRepo.upsertSubscription(db, {
    id: crypto.randomUUID(),
    ownerUserId: owner,
    providerSubscriptionId: `sub_${owner}`,
    providerProductId: "prod",
    productKey: "starterMonthly",
    planKey: "starter",
    billingInterval: "month",
    status: "active",
    currentPeriodStart: 0,
    currentPeriodEnd: currentMonthPeriod().resetAt,
    cancelAtPeriodEnd: false,
    canceledAt: null,
    rawJson: null,
    createdAt: 1,
    updatedAt: 1,
  });
  return owner;
}

async function cleanup() {
  if (!DATABASE_URL) return;
  const like = `itdeep_${SUFFIX}_%`;
  // FK-child research_sources SEBELUM users (defensif walau itest ini tak seed-nya).
  await client`delete from research_sources where owner_user_id like ${like}`;
  await client`delete from provider_usage_ledger where owner_user_id like ${like}`;
  await client`delete from usage_daily_rollup where owner_user_id like ${like}`;
  await client`delete from billing_credit_periods where owner_user_id like ${like}`;
  await client`delete from billing_subscriptions where owner_user_id like ${like}`;
  await client`delete from users where owner_user_id like ${like}`;
}

beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await client.end();
});

const deepArgs = (owner: string, idempotencyKey?: string) => ({
  ownerUserId: owner,
  feature: "deep_research" as const,
  provider: "openai",
  agentKind: "lite" as const, // 60 kredit
  requiredPlan: "starter" as const,
  ...(idempotencyKey ? { idempotencyKey } : {}),
});

describe("BillingService.consumeCredits(deep_research) — idempotency + cap", () => {
  itest("key sama (resume) = 1 debit; cap bulanan blok run berikut TANPA consume", async () => {
    const owner = await starterOwner();
    const key = `${owner}:turn1:deep`;

    // 1) Debit pertama (approve plan).
    const first = await BillingService.consumeCredits(db, deepArgs(owner, key));
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.creditsUsed).toBe(60);

    // 2) Resume durable, key sama → idempoten, TAK double-debit.
    const rerun = await BillingService.consumeCredits(db, deepArgs(owner, key));
    expect(rerun.ok).toBe(true);
    expect((await BillingService.getCurrentPeriod(db, owner)).creditsUsed).toBe(60);

    // 3) Dua deep-run lagi (key beda) → total 3 ledger deep = cap starter.
    expect((await BillingService.consumeCredits(db, deepArgs(owner, `${owner}:turn2:deep`))).ok).toBe(true);
    expect((await BillingService.consumeCredits(db, deepArgs(owner, `${owner}:turn3:deep`))).ok).toBe(true);
    const used3 = (await BillingService.getCurrentPeriod(db, owner)).creditsUsed;
    expect(used3).toBe(180); // 3 × 60

    // 4) Run ke-4 → cap tercapai → quota_exceeded, TANPA debit (block ≠ consume).
    const capped = await BillingService.consumeCredits(db, deepArgs(owner, `${owner}:turn4:deep`));
    expect(capped.ok).toBe(false);
    if (!capped.ok) expect(capped.reason).toBe("quota_exceeded");
    expect((await BillingService.getCurrentPeriod(db, owner)).creditsUsed).toBe(180); // tak naik
  });
});

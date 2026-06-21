import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { BillingRepo } from "../src/repositories/billingRepo";
import { createDb } from "../src/client";
import { users } from "../src/schema/users";

// Integration: butuh Postgres live (DATABASE_URL). Tanpa env → skip. Data test
// di-prefix aman + dibersihkan di before/afterAll.
const DATABASE_URL = process.env.DATABASE_URL;
const itest = DATABASE_URL ? test : test.skip;

const SUFFIX = Math.floor(Math.random() * 1e9);
const OWNER = `itbilldb_${SUFFIX}`;
const PERIOD = `itest-${SUFFIX}`;
const SUB = `sub_itest_${SUFFIX}`;

const { db, client } = createDb(DATABASE_URL ?? "postgresql://x");

async function cleanup() {
  if (!DATABASE_URL) return;
  await client`delete from provider_usage_ledger where owner_user_id = ${OWNER}`;
  await client`delete from usage_daily_rollup where owner_user_id = ${OWNER}`;
  await client`delete from billing_credit_periods where owner_user_id = ${OWNER}`;
  await client`delete from billing_subscriptions where owner_user_id = ${OWNER}`;
  await client`delete from admin_entitlements where owner_user_id = ${OWNER}`;
  await client`delete from users where owner_user_id = ${OWNER}`;
}

beforeAll(async () => {
  if (!DATABASE_URL) return;
  await cleanup();
  await db.insert(users).values({ ownerUserId: OWNER, clerkUserId: OWNER, createdAt: 1, updatedAt: 1 });
});
afterAll(async () => {
  await cleanup();
  await client.end();
});

describe("BillingRepo — subscription mirror", () => {
  itest("upsert idempotent by polar_subscription_id (update, createdAt preserved)", async () => {
    await BillingRepo.upsertSubscription(db, {
      id: crypto.randomUUID(),
      ownerUserId: OWNER,
      polarSubscriptionId: SUB,
      polarProductId: "prod_x",
      productKey: "starterMonthly",
      planKey: "starter",
      billingInterval: "month",
      status: "active",
      currentPeriodStart: 1000,
      currentPeriodEnd: 2000,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      rawJson: { a: 1 },
      createdAt: 111,
      updatedAt: 111,
    });
    const first = await BillingRepo.findSubscriptionByPolarId(db, SUB);
    expect(first?.planKey).toBe("starter");

    await BillingRepo.upsertSubscription(db, {
      id: crypto.randomUUID(), // id baru diabaikan (conflict on polar id)
      ownerUserId: OWNER,
      polarSubscriptionId: SUB,
      polarProductId: "prod_y",
      productKey: "plusMonthly",
      planKey: "plus",
      billingInterval: "month",
      status: "canceled",
      currentPeriodStart: 1000,
      currentPeriodEnd: 9999,
      cancelAtPeriodEnd: true,
      canceledAt: 5000,
      rawJson: { a: 2 },
      createdAt: 999, // diabaikan saat update
      updatedAt: 222,
    });
    const updated = await BillingRepo.findSubscriptionByPolarId(db, SUB);
    expect(updated?.id).toBe(first!.id); // baris sama
    expect(updated?.planKey).toBe("plus");
    expect(updated?.status).toBe("canceled");
    expect(updated?.createdAt).toBe(111); // createdAt tetap

    const latest = await BillingRepo.findLatestSubscriptionByOwner(db, OWNER);
    expect(latest?.polarSubscriptionId).toBe(SUB);
  });
});

describe("BillingRepo — credit period debit (atomik, row-lock)", () => {
  itest("insert-if-absent idempotent + debit increments dalam transaksi", async () => {
    const id = crypto.randomUUID();
    await BillingRepo.insertPeriodIfAbsent(db, {
      id,
      ownerUserId: OWNER,
      periodKey: PERIOD,
      planKey: "free",
      status: "free",
      creditsLimit: 50,
      creditsUsed: 0,
      estimatedCostCents: 0,
      spendCeilingCents: 0,
      startedAt: 0,
      resetAt: 10_000,
      createdAt: 1,
      updatedAt: 1,
    });
    // insert kedua dengan id berbeda → no-op (unique owner+period)
    await BillingRepo.insertPeriodIfAbsent(db, {
      id: crypto.randomUUID(),
      ownerUserId: OWNER,
      periodKey: PERIOD,
      planKey: "free",
      status: "free",
      creditsLimit: 50,
      creditsUsed: 999,
      estimatedCostCents: 0,
      spendCeilingCents: 0,
      startedAt: 0,
      resetAt: 10_000,
      createdAt: 1,
      updatedAt: 1,
    });
    const found = await BillingRepo.findPeriod(db, OWNER, PERIOD);
    expect(found?.id).toBe(id);
    expect(found?.creditsUsed).toBe(0); // insert kedua diabaikan

    await db.transaction(async (tx) => {
      const locked = await BillingRepo.lockPeriod(tx, OWNER, PERIOD);
      expect(locked?.id).toBe(id);
      await BillingRepo.debitPeriod(tx, id, 5, 7, 100);
    });
    await db.transaction(async (tx) => {
      await BillingRepo.lockPeriod(tx, OWNER, PERIOD);
      await BillingRepo.debitPeriod(tx, id, 3, 2, 200);
    });
    const after = await BillingRepo.findPeriod(db, OWNER, PERIOD);
    expect(after?.creditsUsed).toBe(8); // 5 + 3
    expect(after?.estimatedCostCents).toBe(9); // 7 + 2
    expect(after?.updatedAt).toBe(200);
  });
});

describe("BillingRepo — ledger idempotency (A9)", () => {
  itest("insertLedgerIfNew: key sama → false (no double); null key → selalu insert", async () => {
    const key = `idem_${SUFFIX}_x`;
    const first = await BillingRepo.insertLedgerIfNew(db, {
      id: crypto.randomUUID(),
      ownerUserId: OWNER,
      feature: "normal_chat",
      provider: "test",
      credits: 1,
      estimatedCostCents: 0,
      idempotencyKey: key,
      createdAt: 1,
    });
    expect(first).toBe(true);
    const dup = await BillingRepo.insertLedgerIfNew(db, {
      id: crypto.randomUUID(),
      ownerUserId: OWNER,
      feature: "normal_chat",
      provider: "test",
      credits: 1,
      estimatedCostCents: 0,
      idempotencyKey: key,
      createdAt: 2,
    });
    expect(dup).toBe(false); // konflik → no insert

    const a = await BillingRepo.insertLedgerIfNew(db, {
      id: crypto.randomUUID(),
      ownerUserId: OWNER,
      feature: "normal_chat",
      provider: "test",
      credits: 1,
      estimatedCostCents: 0,
      idempotencyKey: null,
      createdAt: 3,
    });
    const b = await BillingRepo.insertLedgerIfNew(db, {
      id: crypto.randomUUID(),
      ownerUserId: OWNER,
      feature: "normal_chat",
      provider: "test",
      credits: 1,
      estimatedCostCents: 0,
      idempotencyKey: null,
      createdAt: 4,
    });
    expect(a && b).toBe(true); // null key tak pernah konflik
  });

  itest("countDeepResearchInWindow menghitung hanya deep_research dalam window", async () => {
    const base = 50_000;
    for (const t of [base + 1, base + 2, base + 3]) {
      await BillingRepo.insertLedgerIfNew(db, {
        id: crypto.randomUUID(),
        ownerUserId: OWNER,
        feature: "deep_research",
        provider: "test",
        credits: 60,
        estimatedCostCents: 0,
        idempotencyKey: null,
        createdAt: t,
      });
    }
    // satu di luar window
    await BillingRepo.insertLedgerIfNew(db, {
      id: crypto.randomUUID(),
      ownerUserId: OWNER,
      feature: "deep_research",
      provider: "test",
      credits: 60,
      estimatedCostCents: 0,
      idempotencyKey: null,
      createdAt: base + 9_999,
    });
    const n = await BillingRepo.countDeepResearchInWindow(db, {
      ownerUserId: OWNER,
      startedAt: base,
      resetAt: base + 100,
      cap: 2,
    });
    expect(n).toBe(3); // 3 dalam window, di-cap di cap+1=3
  });
});

describe("BillingRepo — rollup increment (jsonb featureCounts)", () => {
  itest("upsert increment: credits/eventCount/featureCounts naik per feature", async () => {
    const DATE = `2099-12-${(10 + (SUFFIX % 18)).toString().padStart(2, "0")}`;
    await BillingRepo.upsertRollupIncrement(db, {
      id: crypto.randomUUID(),
      ownerUserId: OWNER,
      date: DATE,
      credits: 5,
      estimatedCostCents: 2,
      feature: "normal_chat",
    });
    await BillingRepo.upsertRollupIncrement(db, {
      id: crypto.randomUUID(),
      ownerUserId: OWNER,
      date: DATE,
      credits: 3,
      estimatedCostCents: 1,
      feature: "normal_chat",
    });
    await BillingRepo.upsertRollupIncrement(db, {
      id: crypto.randomUUID(),
      ownerUserId: OWNER,
      date: DATE,
      credits: 120,
      estimatedCostCents: 0,
      feature: "deep_research",
    });
    const rows = await BillingRepo.listRollupByDateRange(db, {
      ownerUserId: OWNER,
      startDate: DATE,
      endDate: DATE,
    });
    expect(rows.length).toBe(1);
    const row = rows[0]!;
    expect(row.credits).toBe(128); // 5+3+120
    expect(row.estimatedCostCents).toBe(3); // 2+1+0
    expect(row.eventCount).toBe(3);
    expect(row.featureCounts.normal_chat).toBe(2);
    expect(row.featureCounts.deep_research).toBe(1);
    expect(row.featureCounts.pro_chat ?? 0).toBe(0);
  });
});

describe("BillingRepo — admin entitlement", () => {
  itest("upsert + find", async () => {
    await BillingRepo.upsertAdminEntitlement(db, {
      ownerUserId: OWNER,
      email: "admin@aqsha.test",
      enabled: true,
    });
    const found = await BillingRepo.findAdminEntitlement(db, OWNER);
    expect(found?.enabled).toBe(true);
    expect(found?.email).toBe("admin@aqsha.test");
  });
});

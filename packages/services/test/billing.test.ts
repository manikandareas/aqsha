import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { AppError, createDb } from "@aqsha/db";
import { BillingRepo } from "@aqsha/db";
import { users } from "@aqsha/db/schema";
import { BillingService } from "../src/billing.service";
import { resolveEffectivePlanKey } from "../src/billing/snapshot";
import { evaluateGate } from "../src/billing/period";
import {
  billingStatusAllowsUsage,
  currentMonthPeriod,
  estimateCredits,
  requiredPlanForFeature,
} from "../src/plan";

// ── Pure (tanpa db) ──────────────────────────────────────────────────────────
describe("estimateCredits", () => {
  test("normal_chat = ceil(tokens/1500), min 1", () => {
    expect(estimateCredits({ feature: "normal_chat", totalTokens: 0 })).toBe(1);
    expect(estimateCredits({ feature: "normal_chat", totalTokens: 1500 })).toBe(1);
    expect(estimateCredits({ feature: "normal_chat", totalTokens: 1501 })).toBe(2);
  });
  test("pro_chat ~6x lebih mahal (tokens/250)", () => {
    expect(estimateCredits({ feature: "pro_chat", totalTokens: 1000 })).toBe(4);
  });
  test("deep_research flat per agentKind", () => {
    expect(estimateCredits({ feature: "deep_research", agentKind: "lite" })).toBe(60);
    expect(estimateCredits({ feature: "deep_research", agentKind: "pro" })).toBe(120);
    expect(estimateCredits({ feature: "deep_research" })).toBe(120); // default pro
  });
  test("external_search=2, sandbox_compute=10, citation_verify=0 (tracked not charged)", () => {
    expect(estimateCredits({ feature: "external_search" })).toBe(2);
    expect(estimateCredits({ feature: "sandbox_compute" })).toBe(10);
    expect(estimateCredits({ feature: "citation_verify" })).toBe(0);
  });
});

describe("requiredPlanForFeature", () => {
  test("pro_chat/deep_research/sandbox_compute → starter; lainnya → free", () => {
    expect(requiredPlanForFeature("pro_chat")).toBe("starter");
    expect(requiredPlanForFeature("deep_research")).toBe("starter");
    expect(requiredPlanForFeature("sandbox_compute")).toBe("starter");
    expect(requiredPlanForFeature("normal_chat")).toBe("free");
    expect(requiredPlanForFeature("external_search")).toBe("free");
  });
});

describe("billingStatusAllowsUsage", () => {
  test("admin/free selalu; active/trialing ya; canceled hanya bila period belum lewat", () => {
    expect(billingStatusAllowsUsage({ planKey: "admin", status: "admin" })).toBe(true);
    expect(billingStatusAllowsUsage({ planKey: "free", status: "free" })).toBe(true);
    expect(billingStatusAllowsUsage({ planKey: "starter", status: "active" })).toBe(true);
    expect(billingStatusAllowsUsage({ planKey: "starter", status: "trialing" })).toBe(true);
    expect(billingStatusAllowsUsage({ planKey: "starter", status: "past_due" })).toBe(false);
    expect(
      billingStatusAllowsUsage({ planKey: "starter", status: "canceled", currentPeriodEnd: 10, now: 5 }),
    ).toBe(true);
    expect(
      billingStatusAllowsUsage({ planKey: "starter", status: "canceled", currentPeriodEnd: 5, now: 10 }),
    ).toBe(false);
  });
});

describe("BillingService.listPlans (pure katalog)", () => {
  const KEY = "MAYAR_API_KEY";
  const prevKey = process.env[KEY];
  afterEach(() => {
    if (prevKey === undefined) delete process.env[KEY];
    else process.env[KEY] = prevKey;
  });

  test("4 plan publik; free tanpa produk; starter/plus/ultra punya produk", () => {
    delete process.env[KEY];
    const plans = BillingService.listPlans();
    expect(plans.map((p) => p.key)).toEqual(["free", "starter", "plus", "ultra"]);
    expect(plans.find((p) => p.key === "free")!.products).toEqual([]);
    const starter = plans.find((p) => p.key === "starter")!;
    expect(starter.products.map((p) => p.key).sort()).toEqual(["starterMonthly", "starterYearly"]);
    const ultra = plans.find((p) => p.key === "ultra")!;
    expect(ultra.products.map((p) => p.key).sort()).toEqual(["ultraMonthly", "ultraYearly"]);
  });

  test("configured = ada/tidaknya MAYAR_API_KEY (link bayar dinamis), bukan tier-id", () => {
    delete process.env[KEY];
    const off = BillingService.listPlans().find((p) => p.key === "starter")!;
    expect(off.products.every((p) => p.configured === false)).toBe(true);

    process.env[KEY] = "eyJ.test";
    const on = BillingService.listPlans().find((p) => p.key === "ultra")!;
    expect(on.products.every((p) => p.configured === true)).toBe(true);
  });
});

describe("currentMonthPeriod", () => {
  test("key 'YYYY-MM' + start/reset UTC bulan", () => {
    const p = currentMonthPeriod(Date.UTC(2026, 5, 15)); // Juni 2026
    expect(p.key).toBe("2026-06");
    expect(p.startAt).toBe(Date.UTC(2026, 5, 1));
    expect(p.resetAt).toBe(Date.UTC(2026, 6, 1));
  });
});

describe("evaluateGate (pure return-union)", () => {
  const period = { periodKey: "2026-06", resetAt: 999, creditsLimit: 50, creditsUsed: 10 };
  const base = {
    status: "free" as const,
    currentPeriodEnd: null,
    feature: "normal_chat" as const,
    credits: 5,
    period,
    deepLimitReached: false,
  };

  test("admin → ok tanpa cek apa pun", () => {
    const r = evaluateGate({ ...base, isAdmin: true, planKey: "admin" });
    expect(r.ok).toBe(true);
  });
  test("plan < required → subscription_required", () => {
    const r = evaluateGate({ ...base, isAdmin: false, planKey: "free", feature: "pro_chat", credits: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("subscription_required");
  });
  test("status block → billing_inactive", () => {
    const r = evaluateGate({
      ...base,
      isAdmin: false,
      planKey: "starter",
      status: "past_due",
      feature: "pro_chat",
      credits: 1,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("billing_inactive");
  });
  test("remaining < credits → quota_exceeded", () => {
    const r = evaluateGate({ ...base, isAdmin: false, planKey: "free", credits: 999 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("quota_exceeded");
  });
  test("deepLimitReached → quota_exceeded (deep)", () => {
    const r = evaluateGate({
      ...base,
      isAdmin: false,
      planKey: "starter",
      status: "active",
      feature: "deep_research",
      requiredPlan: "starter",
      credits: 120,
      period: { ...period, creditsLimit: 500, creditsUsed: 0 },
      deepLimitReached: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("quota_exceeded");
  });
  test("dalam batas → ok", () => {
    const r = evaluateGate({ ...base, isAdmin: false, planKey: "free" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.creditsRemaining).toBe(40);
  });
});

// ── Integration (real db; skip tanpa DATABASE_URL) ───────────────────────────
const DATABASE_URL = process.env.DATABASE_URL;
const itest = DATABASE_URL ? test : test.skip;
const SUFFIX = Math.floor(Math.random() * 1e9);
const { db, client } = createDb(DATABASE_URL ?? "postgresql://x");

let seq = 0;
async function freshOwner(): Promise<string> {
  const owner = `itbillsvc_${SUFFIX}_${seq++}`;
  if (DATABASE_URL) {
    await db.insert(users).values({ ownerUserId: owner, clerkUserId: owner, createdAt: 1, updatedAt: 1 });
  }
  return owner;
}

async function cleanup() {
  if (!DATABASE_URL) return;
  const like = `itbillsvc_${SUFFIX}_%`;
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

describe("BillingService.consumeCredits (integration)", () => {
  itest("free: debit lalu quota_exceeded return-union (tanpa double-debit)", async () => {
    const owner = await freshOwner();
    // Free limit = 150. Debit 120 → sisa 30; debit 40 berikut > sisa → quota_exceeded.
    const ok = await BillingService.consumeCredits(db, {
      ownerUserId: owner,
      feature: "normal_chat",
      provider: "test",
      credits: 120,
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.creditsUsed).toBe(120);

    const blocked = await BillingService.consumeCredits(db, {
      ownerUserId: owner,
      feature: "normal_chat",
      provider: "test",
      credits: 40, // remaining 30 < 40
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe("quota_exceeded");

    const period = await BillingService.getCurrentPeriod(db, owner);
    expect(period.creditsUsed).toBe(120); // block tak menambah debit
  });

  itest("A9 idempotency: re-run key sama tak double-debit", async () => {
    const owner = await freshOwner();
    const first = await BillingService.consumeCredits(db, {
      ownerUserId: owner,
      feature: "normal_chat",
      provider: "test",
      credits: 5,
      idempotencyKey: `k_${owner}`,
    });
    expect(first.ok && first.creditsUsed).toBe(5);
    const rerun = await BillingService.consumeCredits(db, {
      ownerUserId: owner,
      feature: "normal_chat",
      provider: "test",
      credits: 5,
      idempotencyKey: `k_${owner}`,
    });
    expect(rerun.ok).toBe(true);
    const period = await BillingService.getCurrentPeriod(db, owner);
    expect(period.creditsUsed).toBe(5); // STILL 5 (tidak 10)
  });

  itest("free pro_chat → subscription_required (tanpa debit)", async () => {
    const owner = await freshOwner();
    const r = await BillingService.consumeCredits(db, {
      ownerUserId: owner,
      feature: "pro_chat",
      provider: "test",
      credits: 1,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("subscription_required");
    const period = await BillingService.getCurrentPeriod(db, owner);
    expect(period.creditsUsed).toBe(0);
  });

  itest("admin (env allowlist) → unlimited", async () => {
    const owner = await freshOwner();
    const prev = process.env.AQSHA_ADMIN_OWNER_USER_IDS;
    process.env.AQSHA_ADMIN_OWNER_USER_IDS = owner;
    try {
      const r = await BillingService.consumeCredits(db, {
        ownerUserId: owner,
        feature: "pro_chat",
        provider: "test",
        credits: 999_999,
      });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.planKey).toBe("admin");
      expect(await resolveEffectivePlanKey(db, { ownerUserId: owner })).toBe("admin");
    } finally {
      if (prev === undefined) delete process.env.AQSHA_ADMIN_OWNER_USER_IDS;
      else process.env.AQSHA_ADMIN_OWNER_USER_IDS = prev;
    }
  });

  itest("starter subscription: plan efektif + deep run cap", async () => {
    const owner = await freshOwner();
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
    expect(await resolveEffectivePlanKey(db, { ownerUserId: owner })).toBe("starter");

    // starter: 3 deep run/bulan, DEEP_PRO=120 cr (3*120=360 < 500 limit) → run ke-4 ditolak cap.
    for (let i = 0; i < 3; i++) {
      const r = await BillingService.consumeCredits(db, {
        ownerUserId: owner,
        feature: "deep_research",
        provider: "test",
        requiredPlan: "starter",
        agentKind: "pro",
      });
      expect(r.ok).toBe(true);
    }
    const capped = await BillingService.consumeCredits(db, {
      ownerUserId: owner,
      feature: "deep_research",
      provider: "test",
      requiredPlan: "starter",
      agentKind: "pro",
    });
    expect(capped.ok).toBe(false);
    if (!capped.ok) expect(capped.reason).toBe("quota_exceeded");
  });

  itest("getUsageActivity: seed full window + overlay rollup", async () => {
    const owner = await freshOwner();
    await BillingService.consumeCredits(db, {
      ownerUserId: owner,
      feature: "normal_chat",
      provider: "test",
      credits: 3,
    });
    const activity = await BillingService.getUsageActivity(db, owner, 7);
    expect(activity.length).toBe(7);
    const today = activity[activity.length - 1]!;
    expect(today.credits).toBe(3);
    expect(today.featureCounts.normal_chat).toBe(1);
    // hari sebelum hari ini = zero-seeded
    expect(activity[0]!.eventCount).toBe(0);
  });

  itest("getCurrentBilling: free user default (limit 150, remaining 150, deep 0/2)", async () => {
    const owner = await freshOwner();
    const current = await BillingService.getCurrentBilling(db, owner);
    expect(current.planKey).toBe("free");
    expect(current.planLabel).toBe("Free");
    expect(current.creditsLimit).toBe(150);
    expect(current.creditsRemaining).toBe(150);
    // Kuota Deep Research (run count, terpisah dari pool kredit) — fresh owner = 0/2.
    expect(current.deepRunsUsed).toBe(0);
    expect(current.deepRunsLimit).toBe(2);
    expect(current.billingPortalAvailable).toBe(false);
    expect(current.canChangeSubscription).toBe(false);
  });

  itest("syncSubscriptionFromMayar: match by email, upsert mirror + snapshot reflect; idempotent", async () => {
    const owner = await freshOwner();
    const email = `${owner}@mayar.test`;
    await client`update users set email = ${email} where owner_user_id = ${owner}`;
    const payload = {
      customerEmail: email,
      event: "membership.newMemberRegistered",
      providerProductId: "prod",
      productKey: "starterMonthly",
      status: "active",
      currentPeriodStart: 0,
      currentPeriodEnd: currentMonthPeriod().resetAt,
      cancelAtPeriodEnd: false,
      rawJson: { foo: "bar" },
    };
    const r1 = await BillingService.syncSubscriptionFromMayar(db, payload);
    expect(r1.matched).toBe(true);
    await BillingService.syncSubscriptionFromMayar(db, payload); // idempotent (synthetic key sama)

    const snap = await BillingService.getBillingSnapshot(db, owner);
    expect(snap.planKey).toBe("starter");
    expect(snap.productKey).toBe("starterMonthly");
    expect(snap.billingInterval).toBe("month");
    expect(snap.canChangeSubscription).toBe(true);
    expect(snap.canCancelSubscription).toBe(true);

    const all = await client`select count(*)::int as n from billing_subscriptions where owner_user_id = ${owner}`;
    expect(all[0]!.n).toBe(1); // satu baris (idempotent by synthetic provider id)
  });

  itest("syncSubscriptionFromMayar: email tak cocok user → pending (matched=false)", async () => {
    const email = `nobody_${SUFFIX}_${seq}@nope.test`;
    const r = await BillingService.syncSubscriptionFromMayar(db, {
      customerEmail: email,
      event: "membership.newMemberRegistered",
      providerProductId: "prod",
      productKey: "starterMonthly",
      status: "active",
    });
    expect(r.matched).toBe(false);
    const pending = await client`select count(*)::int as n from billing_pending_webhooks where customer_email = ${email}`;
    expect(pending[0]!.n).toBe(1);
  });

  itest("syncSubscriptionFromMayar: produk tak dikenal (→free/admin) → 422", async () => {
    let code: string | undefined;
    try {
      await BillingService.syncSubscriptionFromMayar(db, {
        customerEmail: "x@y.test",
        event: "membership.newMemberRegistered",
        providerProductId: "prod",
        // productKey undefined → planForProductKey === "free" → reject (sebelum resolve owner)
        status: "active",
      });
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      code = (e as AppError).code;
    }
    expect(code).toBe("billing_subscription_product_unknown");
  });

  itest("one-time expired: currentPeriodEnd lewat → effective/snapshot plan = free", async () => {
    const owner = await freshOwner();
    await BillingRepo.upsertSubscription(db, {
      id: crypto.randomUUID(),
      ownerUserId: owner,
      providerSubscriptionId: `sub_exp_${owner}`,
      providerProductId: "tier_sm",
      productKey: "starterMonthly",
      planKey: "starter",
      billingInterval: "month",
      status: "active",
      currentPeriodStart: 0,
      currentPeriodEnd: Date.now() - 1000, // single payment sudah lewat
      cancelAtPeriodEnd: true,
      canceledAt: null,
      rawJson: null,
      createdAt: 1,
      updatedAt: 1,
    });
    expect(await resolveEffectivePlanKey(db, { ownerUserId: owner })).toBe("free");
    expect((await BillingService.getBillingSnapshot(db, owner)).planKey).toBe("free");
    // pro feature → subscription_required (akses berbayar tak berlaku lagi)
    const pro = await BillingService.consumeCredits(db, {
      ownerUserId: owner,
      feature: "pro_chat",
      provider: "test",
      credits: 1,
    });
    expect(pro.ok).toBe(false);
    if (!pro.ok) expect(pro.reason).toBe("subscription_required");
  });
});

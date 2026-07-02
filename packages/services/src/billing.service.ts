import {
  type BillingCreditPeriod,
  BillingRepo,
  type Db,
  type DbOrTx,
  type FeatureCounts,
  normalizeFeatureCounts,
  throwAppError,
  UserRepo,
} from "@aqsha/db";
import {
  type BillingInterval,
  type BillingStatus,
  type CreditFeature,
  estimateCredits,
  estimateProviderCostCents,
  intervalForProductKey,
  isSubscriptionExpired,
  normalizeBillingStatus,
  PLAN_CATALOG,
  type PlanKey,
  planForProductKey,
  PRODUCT_CATALOG,
  PRODUCT_KEYS,
  type ProductKey,
  PUBLIC_PLAN_KEYS,
  type PublicPlanKey,
  requiredPlanForFeature,
  UNLIMITED,
} from "./plan";
import { getEntitlementSnapshot, resolveAdminOverride } from "./billing/snapshot";
import { ensureAndLockPeriod, ensureCreditPeriod, evaluateGate, utcDateString } from "./billing/period";
import { configuredTierId, isCheckoutConfigured, MayarClient } from "./clients/mayar";
import type { ConsumeCreditsArgs, EntitlementResult } from "./billing/types";

const DAY_MS = 24 * 60 * 60 * 1000;

export type UsageDay = {
  date: string;
  credits: number;
  estimatedCostCents: number;
  eventCount: number;
  featureCounts: Required<FeatureCounts>;
};

export type CurrentPeriodSummary = {
  periodKey: string;
  planKey: PlanKey;
  isAdmin: boolean;
  isUnlimitedCredits: boolean;
  creditsLimit: number;
  creditsUsed: number;
  creditsRemaining: number;
  estimatedCostCents: number;
  spendCeilingCents: number;
  resetAt: number;
};

/** Snapshot subscription kaya (mirror + admin) — basis GET /billing/current. */
export type BillingSnapshot = {
  planKey: PlanKey;
  status: BillingStatus;
  productKey: string | null;
  billingInterval: BillingInterval | null;
  currentPeriodStart: number | null;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: number | null;
  isAdmin: boolean;
  isUnlimitedCredits: boolean;
  billingPortalAvailable: boolean;
  canChangeSubscription: boolean;
  canCancelSubscription: boolean;
};

/** Full body GET /billing/current (snapshot + credit period). */
export type CurrentBillingResponse = BillingSnapshot & {
  planLabel: string;
  creditsLimit: number;
  creditsUsed: number;
  creditsRemaining: number;
  resetAt: number;
  providerSpendCeilingCents: number;
  estimatedCostCents: number;
  /**
   * Kuota Deep Research bulanan — run count TERPISAH dari pool kredit (cap
   * `deepResearchRuns` per plan). Unlimited (Ultra/Admin) → `deepRunsLimit`
   * = `Number.MAX_SAFE_INTEGER`, `deepRunsUsed` = 0.
   */
  deepRunsUsed: number;
  deepRunsLimit: number;
};

export type PlanListItem = {
  key: PublicPlanKey;
  label: string;
  monthlyPriceIdr: number;
  annualPriceIdr: number;
  monthlyCredits: number;
  deepResearchRuns: number;
  workspaceLimit: number;
  libraryItemLimit: number;
  providerSpendCeilingCents: number;
  features: string[];
  products: Array<{
    key: ProductKey;
    providerProductId: string | null;
    interval: BillingInterval;
    displayPriceIdr: number;
    configured: boolean;
  }>;
};

/**
 * Payload sync subscription (derived dari event Mayar di route /webhooks/mayar).
 * Mayar tak beri subscription id/owner → atribusi by `customerEmail`, period-end
 * & status sudah diturunkan route. Owner di-resolve di service (UserRepo.findByEmail);
 * email tak cocok → simpan pending (matched=false).
 */
export type SyncSubscriptionPayload = {
  customerEmail: string;
  event: string;
  providerProductId: string;
  productKey?: string;
  status: string;
  currentPeriodStart?: number;
  currentPeriodEnd?: number;
  cancelAtPeriodEnd?: boolean;
  canceledAt?: number;
  rawJson?: unknown;
};

function okResult(planKey: PlanKey, period: BillingCreditPeriod): EntitlementResult {
  return {
    ok: true,
    planKey,
    periodKey: period.periodKey,
    resetAt: period.resetAt,
    creditsLimit: period.creditsLimit,
    creditsUsed: period.creditsUsed,
    creditsRemaining: Math.max(0, period.creditsLimit - period.creditsUsed),
  };
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value; // simpan apa adanya (jsonb scalar string) bila bukan JSON valid
  }
}

/** Email owner untuk billing (passed JWT email → users table). Throw bila absen. */
async function resolveOwnerEmail(db: DbOrTx, ownerUserId: string, passed?: string | null): Promise<string> {
  const email = passed ?? (await UserRepo.findByOwnerUserId(db, ownerUserId))?.email ?? null;
  if (!email) {
    throwAppError({
      code: "billing_email_required",
      message: "A verified email is required for billing",
      severity: "error",
      field: "email",
    });
  }
  return email;
}

/** Sisipkan nonce ke URL (anti-dedup 429 Mayar `payment/create` utk body identik). */
function withCacheBuster(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}cb=${crypto.randomUUID()}`;
}

/** Domain email yang dilarang untuk checkout Mayar (port V1 `isReservedEmail`). */
function isReservedEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return (
    domain === "localhost" ||
    domain.endsWith(".local") ||
    domain.endsWith(".localhost") ||
    domain.endsWith(".test") ||
    domain.endsWith(".invalid") ||
    domain.endsWith(".example")
  );
}

async function deepLimitReached(
  db: DbOrTx,
  args: { ownerUserId: string; planKey: PlanKey; startedAt: number; resetAt: number },
): Promise<boolean> {
  const cap = PLAN_CATALOG[args.planKey].deepResearchRuns;
  const count = await BillingRepo.countDeepResearchInWindow(db, {
    ownerUserId: args.ownerUserId,
    startedAt: args.startedAt,
    resetAt: args.resetAt,
    cap,
  });
  return count >= cap;
}

/**
 * BillingService — write-path entitlement + usage (Fase 5). `consumeCredits` =
 * SATU transaksi (debit period row-locked + ledger + rollup) atau none; idempotent
 * saat resume (A9). Block kuota = return-union, BUKAN throw. Mayar surface
 * (snapshot mirror / checkout / portal / sync) ditambah P5.3/P5.4.
 */
export const BillingService = {
  /**
   * Cek entitlement non-consuming (read). Dipakai SendQuotaService preview (P6) +
   * test. Tidak mendebit; period dipastikan ada + ter-sync.
   */
  async requireEntitlement(
    db: DbOrTx,
    args: {
      ownerUserId: string;
      ownerEmail?: string | null;
      feature: CreditFeature;
      credits: number;
      requiredPlan?: ConsumeCreditsArgs["requiredPlan"];
    },
  ): Promise<EntitlementResult> {
    const snapshot = await getEntitlementSnapshot(db, args.ownerUserId, args.ownerEmail);
    const period = await ensureCreditPeriod(db, {
      ownerUserId: args.ownerUserId,
      planKey: snapshot.planKey,
      status: snapshot.status,
    });
    const deep =
      !snapshot.isAdmin && args.feature === "deep_research"
        ? await deepLimitReached(db, {
            ownerUserId: args.ownerUserId,
            planKey: snapshot.planKey,
            startedAt: period.startedAt,
            resetAt: period.resetAt,
          })
        : false;
    return evaluateGate({
      isAdmin: snapshot.isAdmin,
      planKey: snapshot.planKey,
      status: snapshot.status,
      currentPeriodEnd: snapshot.currentPeriodEnd,
      feature: args.feature,
      credits: args.credits,
      requiredPlan: args.requiredPlan,
      period,
      deepLimitReached: deep,
    });
  },

  /**
   * Debit kredit ATOMIK (period + ledger + rollup, satu transaksi). Gate dulu
   * (return-union bila block, tanpa write debit). A9: di bawah lock period, cek
   * idempotency_key → re-run/lost-race tak double-debit. Port V1 `consumeCredits`.
   */
  async consumeCredits(db: Db, args: ConsumeCreditsArgs): Promise<EntitlementResult> {
    const credits =
      args.credits ??
      estimateCredits({
        feature: args.feature,
        provider: args.provider,
        inputTokens: args.inputTokens,
        outputTokens: args.outputTokens,
        totalTokens: args.totalTokens,
        agentKind: args.agentKind,
      });
    const estimatedCostCents =
      args.estimatedCostCents ??
      estimateProviderCostCents({
        provider: args.provider,
        model: args.model,
        inputTokens: args.inputTokens,
        outputTokens: args.outputTokens,
        feature: args.feature,
      });
    const requiredPlan = args.requiredPlan ?? requiredPlanForFeature(args.feature);
    const snapshot = await getEntitlementSnapshot(db, args.ownerUserId, args.ownerEmail);

    return db.transaction(async (tx) => {
      const period = await ensureAndLockPeriod(tx, {
        ownerUserId: args.ownerUserId,
        planKey: snapshot.planKey,
        status: snapshot.status,
      });

      // A9: re-run/lost-race terdeteksi di bawah lock (per-owner serial) → idempotent ok.
      if (args.idempotencyKey) {
        const seen = await BillingRepo.findLedgerByIdempotencyKey(tx, args.ownerUserId, args.idempotencyKey);
        if (seen) return okResult(snapshot.planKey, period);
      }

      const deep =
        !snapshot.isAdmin && args.feature === "deep_research"
          ? await deepLimitReached(tx, {
              ownerUserId: args.ownerUserId,
              planKey: snapshot.planKey,
              startedAt: period.startedAt,
              resetAt: period.resetAt,
            })
          : false;

      const gate = evaluateGate({
        isAdmin: snapshot.isAdmin,
        planKey: snapshot.planKey,
        status: snapshot.status,
        currentPeriodEnd: snapshot.currentPeriodEnd,
        feature: args.feature,
        credits,
        requiredPlan,
        period,
        deepLimitReached: deep,
      });
      if (!gate.ok) return gate; // tak ada write debit; tx commit (period row tetap valid)

      const now = Date.now();
      const inserted = await BillingRepo.insertLedgerIfNew(tx, {
        id: crypto.randomUUID(),
        ownerUserId: args.ownerUserId,
        threadId: args.threadId,
        feature: args.feature,
        provider: args.provider,
        model: args.model,
        inputTokens: args.inputTokens,
        outputTokens: args.outputTokens,
        totalTokens: args.totalTokens,
        credits,
        estimatedCostCents,
        metadata: args.metadataJson ? tryParseJson(args.metadataJson) : null,
        idempotencyKey: args.idempotencyKey ?? null,
        createdAt: now,
      });
      if (!inserted) return okResult(snapshot.planKey, period); // lost race → sudah didebit tx lain

      await BillingRepo.debitPeriod(tx, period.id, credits, estimatedCostCents, now);
      await BillingRepo.upsertRollupIncrement(tx, {
        id: crypto.randomUUID(),
        ownerUserId: args.ownerUserId,
        date: utcDateString(now),
        credits,
        estimatedCostCents,
        feature: args.feature,
      });

      return {
        ok: true,
        planKey: snapshot.planKey,
        periodKey: period.periodKey,
        resetAt: period.resetAt,
        creditsLimit: period.creditsLimit,
        creditsUsed: period.creditsUsed + credits,
        creditsRemaining: Math.max(0, period.creditsLimit - period.creditsUsed - credits),
      };
    });
  },

  /** Ringkasan period berjalan (port V1 `billing.usage.getCurrentPeriod`). */
  async getCurrentPeriod(db: DbOrTx, ownerUserId: string, ownerEmail?: string | null): Promise<CurrentPeriodSummary> {
    const snapshot = await getEntitlementSnapshot(db, ownerUserId, ownerEmail);
    const period = await ensureCreditPeriod(db, {
      ownerUserId,
      planKey: snapshot.planKey,
      status: snapshot.status,
    });
    return {
      periodKey: period.periodKey,
      planKey: period.planKey as PlanKey,
      isAdmin: snapshot.isAdmin,
      isUnlimitedCredits: snapshot.isUnlimitedCredits,
      creditsLimit: period.creditsLimit,
      creditsUsed: period.creditsUsed,
      creditsRemaining: Math.max(0, period.creditsLimit - period.creditsUsed),
      estimatedCostCents: period.estimatedCostCents,
      spendCeilingCents: period.spendCeilingCents,
      resetAt: period.resetAt,
    };
  },

  /**
   * Aktivitas usage harian (port V1 `billing.usage.activity`). Tiap hari UTC dalam
   * window di-seed zero-row (overlay rollup) → output selalu cakup full range.
   */
  async getUsageActivity(db: DbOrTx, ownerUserId: string, days?: number): Promise<UsageDay[]> {
    const dayCount = Math.max(1, Math.min(366, Math.floor(days ?? 365)));
    const now = new Date();
    // End eksklusif = UTC midnight setelah hari ini (byte-identik V1 ledger-scan window).
    const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0);
    const start = end - dayCount * DAY_MS;

    const rows = new Map<string, UsageDay>();
    for (let offset = 0; offset < dayCount; offset += 1) {
      const date = new Date(start + offset * DAY_MS).toISOString().slice(0, 10);
      rows.set(date, {
        date,
        credits: 0,
        estimatedCostCents: 0,
        eventCount: 0,
        featureCounts: normalizeFeatureCounts(null),
      });
    }

    const startDate = new Date(start).toISOString().slice(0, 10);
    const endDate = new Date(end - 1).toISOString().slice(0, 10);
    const rollup = await BillingRepo.listRollupByDateRange(db, { ownerUserId, startDate, endDate });
    for (const day of rollup) {
      const row = rows.get(day.date);
      if (!row) continue;
      row.credits = day.credits;
      row.estimatedCostCents = day.estimatedCostCents;
      row.eventCount = day.eventCount;
      row.featureCounts = normalizeFeatureCounts(day.featureCounts);
    }
    return Array.from(rows.values());
  },

  /**
   * Snapshot subscription kaya (mirror + admin override). Mirror (billing_subscriptions)
   * = source webhook-synced; saat provider (Mayar) down, mirror tetap melayani
   * snapshot tanpa gagal keras. Port V1 `getBillingSnapshot`.
   */
  async getBillingSnapshot(db: DbOrTx, ownerUserId: string, ownerEmail?: string | null): Promise<BillingSnapshot> {
    const admin = await resolveAdminOverride(db, ownerUserId, ownerEmail);
    const mirrored = await BillingRepo.findLatestSubscriptionByOwner(db, ownerUserId);

    if (admin.isAdmin) {
      return {
        planKey: "admin",
        status: "admin",
        productKey: null,
        billingInterval: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        isAdmin: true,
        isUnlimitedCredits: true,
        billingPortalAvailable: Boolean(mirrored),
        canChangeSubscription: false,
        canCancelSubscription: false,
      };
    }

    // Tanpa mirror ATAU one-time payment sudah lewat masa berlaku → tampil free
    // (konsisten dengan entitlement). Portal tetap tersedia bila ada histori.
    if (!mirrored || isSubscriptionExpired(mirrored.currentPeriodEnd)) {
      return {
        planKey: "free",
        status: "free",
        productKey: null,
        billingInterval: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        isAdmin: false,
        isUnlimitedCredits: false,
        billingPortalAvailable: Boolean(mirrored),
        canChangeSubscription: false,
        canCancelSubscription: false,
      };
    }

    const status = normalizeBillingStatus(mirrored.status);
    return {
      planKey: mirrored.planKey as PlanKey,
      status,
      productKey: mirrored.productKey ?? null,
      billingInterval: mirrored.billingInterval as BillingInterval,
      currentPeriodStart: mirrored.currentPeriodStart ?? null,
      currentPeriodEnd: mirrored.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: Boolean(mirrored.cancelAtPeriodEnd),
      canceledAt: mirrored.canceledAt ?? null,
      isAdmin: false,
      isUnlimitedCredits: false,
      billingPortalAvailable: true,
      canChangeSubscription: true,
      canCancelSubscription: (status === "active" || status === "trialing") && !mirrored.cancelAtPeriodEnd,
    };
  },

  /** Body penuh GET /billing/current (snapshot + period). Port V1 `billing.current.get`. */
  async getCurrentBilling(db: DbOrTx, ownerUserId: string, ownerEmail?: string | null): Promise<CurrentBillingResponse> {
    const snapshot = await this.getBillingSnapshot(db, ownerUserId, ownerEmail);
    const period = await ensureCreditPeriod(db, {
      ownerUserId,
      planKey: snapshot.planKey,
      status: snapshot.status,
    });
    // Kuota Deep Research (run count, terpisah dari pool kredit). Unlimited plan
    // (admin/Ultra) di-short-circuit: JANGAN kueri ledger dgn cap MAX_SAFE_INTEGER
    // (limit huge = overflow), cukup laporkan used=0.
    const deepRunsLimit = PLAN_CATALOG[snapshot.planKey].deepResearchRuns;
    const deepRunsUsed =
      snapshot.isAdmin || deepRunsLimit >= UNLIMITED
        ? 0
        : Math.min(
            deepRunsLimit,
            await BillingRepo.countDeepResearchInWindow(db, {
              ownerUserId,
              startedAt: period.startedAt,
              resetAt: period.resetAt,
              cap: deepRunsLimit,
            }),
          );
    return {
      ...snapshot,
      planLabel: PLAN_CATALOG[snapshot.planKey].label,
      creditsLimit: period.creditsLimit,
      creditsUsed: period.creditsUsed,
      creditsRemaining: Math.max(0, period.creditsLimit - period.creditsUsed),
      resetAt: period.resetAt,
      providerSpendCeilingCents: period.spendCeilingCents,
      estimatedCostCents: period.estimatedCostCents,
      deepRunsUsed,
      deepRunsLimit,
    };
  },

  /** Katalog plan publik + produk Mayar terkonfigurasi (port V1 `billing.products.list`). */
  listPlans(): PlanListItem[] {
    return PUBLIC_PLAN_KEYS.map((planKey) => {
      const plan = PLAN_CATALOG[planKey];
      return {
        ...plan,
        key: planKey,
        products:
          planKey === "free"
            ? []
            : PRODUCT_KEYS.filter((key) => PRODUCT_CATALOG[key].planKey === planKey).map((key) => {
                return {
                  key,
                  providerProductId: configuredTierId(key),
                  interval: PRODUCT_CATALOG[key].interval,
                  displayPriceIdr: PRODUCT_CATALOG[key].displayPriceIdr,
                  // "Tersedia untuk dibeli" = MAYAR_API_KEY terkonfigurasi (link bayar
                  // dibuat dinamis dari harga plan, sama untuk semua produk). Tier-id
                  // per-produk hanya fallback webhook, BUKAN syarat checkout.
                  configured: isCheckoutConfigured(),
                };
              }),
      };
    });
  },

  /**
   * Checkout Mayar = link pembayaran LANGSUNG per-produk (single payment). User
   * diarahkan ke halaman bayar produk yang dipilih (nominal terkunci dari harga
   * plan, email/nama prefilled), lalu balik ke `successUrl` setelah bayar. Atribusi
   * owner by-email + plan by-amount di webhook `payment.received`. `successUrl`
   * disisipi nonce karena Mayar men-dedup body identik 1 menit (429).
   */
  async createCheckout(
    db: DbOrTx,
    args: { ownerUserId: string; ownerEmail?: string | null; productKey: ProductKey; successUrl?: string | null },
  ): Promise<{ url: string }> {
    const email = await resolveOwnerEmail(db, args.ownerUserId, args.ownerEmail);
    if (isReservedEmail(email)) {
      throwAppError({
        code: "billing_email_invalid",
        message:
          "Mayar checkout requires a real email domain. Update your account email before subscribing.",
        severity: "error",
        field: "email",
      });
    }
    const product = PRODUCT_CATALOG[args.productKey];
    const intervalLabel = product.interval === "year" ? "Tahunan" : "Bulanan";
    return MayarClient.createPaymentLink({
      email,
      amountIdr: product.displayPriceIdr,
      description: `Langganan Aqsha ${PLAN_CATALOG[product.planKey].label} — ${intervalLabel}`,
      redirectUrl: args.successUrl ? withCacheBuster(args.successUrl) : undefined,
    });
  },

  /**
   * Portal pelanggan Mayar = magic-link dikirim ke email (bukan redirect URL).
   * Return `{ emailed: true }`; frontend menampilkan toast "cek email".
   */
  async createPortalSession(
    db: DbOrTx,
    args: { ownerUserId: string; ownerEmail?: string | null },
  ): Promise<{ emailed: true }> {
    const email = await resolveOwnerEmail(db, args.ownerUserId, args.ownerEmail);
    return MayarClient.createCustomerPortalSession({ email });
  },

  /**
   * Ganti langganan (upgrade/downgrade). Mayar tak punya API change → arahkan ke
   * checkout tier baru; Mayar memancarkan `membership.changeTierMemberRegistered`.
   */
  async changeSubscription(
    db: DbOrTx,
    args: { ownerUserId: string; ownerEmail?: string | null; productKey: ProductKey },
  ): Promise<{ url: string }> {
    return BillingService.createCheckout(db, args);
  },

  /**
   * Batalkan langganan. Mayar tak punya API cancel → kirim magic-link portal agar
   * user berhenti dari portal Mayar. Return `{ emailed: true }`.
   */
  async cancelSubscription(
    db: DbOrTx,
    args: { ownerUserId: string; ownerEmail?: string | null },
  ): Promise<{ emailed: true }> {
    return BillingService.createPortalSession(db, args);
  },

  /** Sinkronisasi produk Mayar (admin/cron) — validasi konektivitas. */
  async syncProducts(): Promise<{ ok: boolean }> {
    return MayarClient.syncProducts();
  },

  /**
   * Upsert mirror subscription dari event Mayar (atribusi by `customerEmail`).
   * Owner di-resolve via UserRepo.findByEmail; email tak cocok → simpan pending
   * (matched=false). Produk free/admin (tak dikenal) → 422. Synthetic
   * `provider_subscription_id = mayar:${productId}:${email}` (stabil lintas-renewal).
   * Dedupe event-level (Redis SETNX) dilakukan di route /webhooks/mayar.
   */
  async syncSubscriptionFromMayar(db: DbOrTx, payload: SyncSubscriptionPayload): Promise<{ matched: boolean }> {
    const planKey = planForProductKey(payload.productKey);
    if (planKey === "free" || planKey === "admin") {
      throwAppError({
        code: "billing_subscription_product_unknown",
        message: "Unknown Mayar product for subscription",
        severity: "error",
        status: 422,
      });
    }
    const now = Date.now();
    const owner = await UserRepo.findByEmail(db, payload.customerEmail);
    if (!owner) {
      // Email pembayar tak cocok user mana pun → simpan untuk rekonsiliasi manual.
      await BillingRepo.insertPendingWebhook(db, {
        id: crypto.randomUUID(),
        event: payload.event,
        customerEmail: payload.customerEmail,
        productId: payload.providerProductId,
        rawJson: payload.rawJson ?? null,
        createdAt: now,
      });
      return { matched: false };
    }
    const billingInterval = intervalForProductKey(payload.productKey) ?? "month";
    const providerSubscriptionId = `mayar:${payload.providerProductId}:${payload.customerEmail}`;
    const existing = await BillingRepo.findSubscriptionByProviderId(db, providerSubscriptionId);
    await BillingRepo.upsertSubscription(db, {
      id: existing?.id ?? crypto.randomUUID(),
      ownerUserId: owner.ownerUserId,
      providerSubscriptionId,
      providerProductId: payload.providerProductId,
      productKey: payload.productKey ?? null,
      planKey,
      billingInterval,
      status: payload.status,
      // memberUnsubscribed tak kirim period → pertahankan period existing (akses
      // berlanjut sampai expiry yang sebenarnya; memberExpired baru memotongnya).
      currentPeriodStart: payload.currentPeriodStart ?? existing?.currentPeriodStart ?? null,
      currentPeriodEnd: payload.currentPeriodEnd ?? existing?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: payload.cancelAtPeriodEnd ?? null,
      canceledAt: payload.canceledAt ?? null,
      rawJson: payload.rawJson ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    return { matched: true };
  },
};

// re-export tipe untuk caller (route/web/test). `currentMonthPeriod` di-export via index.ts → ./plan.
export type { EntitlementResult, EntitlementSnapshot, ConsumeCreditsArgs } from "./billing/types";
// Snapshot entitlement hot-path (planKey/isAdmin tanpa ensure-period) — dipakai dynamic
// instructions Astra (CTX-5) untuk menyuntik paket pengguna ke system prompt.
export { getEntitlementSnapshot } from "./billing/snapshot";

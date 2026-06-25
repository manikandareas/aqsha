import { and, desc, eq, gte, lt, lte, sql } from "drizzle-orm";
import {
  type AdminEntitlement,
  adminEntitlements,
} from "../schema/adminEntitlements";
import {
  type BillingCreditPeriod,
  type NewBillingCreditPeriod,
  billingCreditPeriods,
} from "../schema/billingCreditPeriods";
import {
  type NewBillingPendingWebhook,
  billingPendingWebhooks,
} from "../schema/billingPendingWebhooks";
import {
  type BillingSubscription,
  type NewBillingSubscription,
  billingSubscriptions,
} from "../schema/billingSubscriptions";
import {
  type NewProviderUsageLedgerRow,
  providerUsageLedger,
} from "../schema/providerUsageLedger";
import {
  type FeatureCounts,
  type UsageDailyRollupRow,
  emptyFeatureCounts,
  usageDailyRollup,
} from "../schema/usageDailyRollup";
import type { DbOrTx } from "../types";

/**
 * Repo billing — query Drizzle saja (TANPA business rule; gate/estimasi hidup di
 * BillingService). Memegang increment ATOMIK kuota: `lockPeriod` (FOR UPDATE) +
 * `debitPeriod` + `insertLedgerIfNew` (idempotency A9) + `upsertRollupIncrement`
 * dipanggil dalam SATU `db.transaction` oleh service.
 */
export const BillingRepo = {
  // ── subscriptions (mirror) ────────────────────────────────────────────────
  async findSubscriptionByProviderId(
    db: DbOrTx,
    providerSubscriptionId: string,
  ): Promise<BillingSubscription | null> {
    const rows = await db
      .select()
      .from(billingSubscriptions)
      .where(eq(billingSubscriptions.providerSubscriptionId, providerSubscriptionId))
      .limit(1);
    return rows[0] ?? null;
  },

  /** Langganan termutakhir milik owner (SoT fallback snapshot). */
  async findLatestSubscriptionByOwner(
    db: DbOrTx,
    ownerUserId: string,
  ): Promise<BillingSubscription | null> {
    const rows = await db
      .select()
      .from(billingSubscriptions)
      .where(eq(billingSubscriptions.ownerUserId, ownerUserId))
      .orderBy(desc(billingSubscriptions.updatedAt))
      .limit(1);
    return rows[0] ?? null;
  },

  /** Upsert by provider_subscription_id (idempotent webhook). createdAt dipertahankan saat update. */
  async upsertSubscription(db: DbOrTx, row: NewBillingSubscription): Promise<void> {
    await db
      .insert(billingSubscriptions)
      .values(row)
      .onConflictDoUpdate({
        target: billingSubscriptions.providerSubscriptionId,
        set: {
          ownerUserId: row.ownerUserId,
          providerProductId: row.providerProductId,
          productKey: row.productKey,
          planKey: row.planKey,
          billingInterval: row.billingInterval,
          status: row.status,
          currentPeriodStart: row.currentPeriodStart,
          currentPeriodEnd: row.currentPeriodEnd,
          cancelAtPeriodEnd: row.cancelAtPeriodEnd,
          canceledAt: row.canceledAt,
          rawJson: row.rawJson,
          updatedAt: row.updatedAt,
        },
      });
  },

  /** Simpan webhook tak-ter-atribusi (email tak cocok user) untuk rekonsiliasi manual. */
  async insertPendingWebhook(db: DbOrTx, row: NewBillingPendingWebhook): Promise<void> {
    await db.insert(billingPendingWebhooks).values(row);
  },

  // ── admin entitlements ─────────────────────────────────────────────────────
  async findAdminEntitlement(db: DbOrTx, ownerUserId: string): Promise<AdminEntitlement | null> {
    const rows = await db
      .select()
      .from(adminEntitlements)
      .where(eq(adminEntitlements.ownerUserId, ownerUserId))
      .limit(1);
    return rows[0] ?? null;
  },

  /** Upsert override admin (admin seeding, P9). */
  async upsertAdminEntitlement(
    db: DbOrTx,
    row: { ownerUserId: string; email: string | null; enabled: boolean },
  ): Promise<void> {
    const now = Date.now();
    await db
      .insert(adminEntitlements)
      .values({ ...row, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: adminEntitlements.ownerUserId,
        set: { email: row.email, enabled: row.enabled, updatedAt: now },
      });
  },

  // ── credit periods ──────────────────────────────────────────────────────────
  async findPeriod(
    db: DbOrTx,
    ownerUserId: string,
    periodKey: string,
  ): Promise<BillingCreditPeriod | null> {
    const rows = await db
      .select()
      .from(billingCreditPeriods)
      .where(
        and(
          eq(billingCreditPeriods.ownerUserId, ownerUserId),
          eq(billingCreditPeriods.periodKey, periodKey),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  },

  /** Row-lock period (SELECT … FOR UPDATE) untuk increment atomik dalam tx. */
  async lockPeriod(
    db: DbOrTx,
    ownerUserId: string,
    periodKey: string,
  ): Promise<BillingCreditPeriod | null> {
    const rows = await db
      .select()
      .from(billingCreditPeriods)
      .where(
        and(
          eq(billingCreditPeriods.ownerUserId, ownerUserId),
          eq(billingCreditPeriods.periodKey, periodKey),
        ),
      )
      .limit(1)
      .for("update");
    return rows[0] ?? null;
  },

  /** Insert period race-safe (on conflict (owner, period_key) do nothing). */
  async insertPeriodIfAbsent(db: DbOrTx, row: NewBillingCreditPeriod): Promise<void> {
    await db
      .insert(billingCreditPeriods)
      .values(row)
      .onConflictDoNothing({
        target: [billingCreditPeriods.ownerUserId, billingCreditPeriods.periodKey],
      });
  },

  async updatePeriod(
    db: DbOrTx,
    id: string,
    patch: Partial<NewBillingCreditPeriod>,
  ): Promise<void> {
    await db.update(billingCreditPeriods).set(patch).where(eq(billingCreditPeriods.id, id));
  },

  /** Debit atomik: credits_used += credits, estimated_cost_cents += costCents. */
  async debitPeriod(
    db: DbOrTx,
    id: string,
    credits: number,
    estimatedCostCents: number,
    now: number,
  ): Promise<void> {
    await db
      .update(billingCreditPeriods)
      .set({
        creditsUsed: sql`${billingCreditPeriods.creditsUsed} + ${credits}`,
        estimatedCostCents: sql`${billingCreditPeriods.estimatedCostCents} + ${estimatedCostCents}`,
        updatedAt: now,
      })
      .where(eq(billingCreditPeriods.id, id));
  },

  // ── provider usage ledger ────────────────────────────────────────────────────
  /**
   * Insert ledger event; mengembalikan `true` bila ter-insert, `false` bila
   * idempotency_key sudah ada (A9: step re-run saat resume → no-op debit).
   * idempotency_key null → selalu insert (partial unique mengecualikan null).
   */
  async insertLedgerIfNew(db: DbOrTx, row: NewProviderUsageLedgerRow): Promise<boolean> {
    const inserted = await db
      .insert(providerUsageLedger)
      .values(row)
      // Composite partial unique (owner, key) → arbiter butuh predikat WHERE yang sama.
      .onConflictDoNothing({
        target: [providerUsageLedger.ownerUserId, providerUsageLedger.idempotencyKey],
        where: sql`${providerUsageLedger.idempotencyKey} is not null`,
      })
      .returning({ id: providerUsageLedger.id });
    return inserted.length > 0;
  },

  /** Cari ledger event by (owner, idempotency_key) — cek re-run di bawah lock period. */
  async findLedgerByIdempotencyKey(
    db: DbOrTx,
    ownerUserId: string,
    idempotencyKey: string,
  ): Promise<{ id: string } | null> {
    const rows = await db
      .select({ id: providerUsageLedger.id })
      .from(providerUsageLedger)
      .where(
        and(
          eq(providerUsageLedger.ownerUserId, ownerUserId),
          eq(providerUsageLedger.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  },

  /**
   * Jumlah deep_research event dalam window period [startedAt, resetAt), di-cap
   * `cap + 1` (cukup untuk cek `>= cap`). Index by_owner_feature_created.
   */
  async countDeepResearchInWindow(
    db: DbOrTx,
    args: { ownerUserId: string; startedAt: number; resetAt: number; cap: number },
  ): Promise<number> {
    const rows = await db
      .select({ id: providerUsageLedger.id })
      .from(providerUsageLedger)
      .where(
        and(
          eq(providerUsageLedger.ownerUserId, args.ownerUserId),
          eq(providerUsageLedger.feature, "deep_research"),
          gte(providerUsageLedger.createdAt, args.startedAt),
          lt(providerUsageLedger.createdAt, args.resetAt),
        ),
      )
      .limit(args.cap + 1);
    return rows.length;
  },

  // ── usage daily rollup ───────────────────────────────────────────────────────
  /**
   * Bump atomik rollup per (owner, UTC day): credits/estimatedCostCents/eventCount
   * naik + featureCounts[feature]++ via jsonb_set. Insert-or-update by_owner_date.
   */
  async upsertRollupIncrement(
    db: DbOrTx,
    args: {
      id: string;
      ownerUserId: string;
      date: string;
      credits: number;
      estimatedCostCents: number;
      feature: keyof FeatureCounts;
    },
  ): Promise<void> {
    const seedCounts = emptyFeatureCounts();
    seedCounts[args.feature] = 1;
    await db
      .insert(usageDailyRollup)
      .values({
        id: args.id,
        ownerUserId: args.ownerUserId,
        date: args.date,
        credits: args.credits,
        estimatedCostCents: args.estimatedCostCents,
        eventCount: 1,
        featureCounts: seedCounts,
      })
      .onConflictDoUpdate({
        target: [usageDailyRollup.ownerUserId, usageDailyRollup.date],
        set: {
          credits: sql`${usageDailyRollup.credits} + ${args.credits}`,
          estimatedCostCents: sql`${usageDailyRollup.estimatedCostCents} + ${args.estimatedCostCents}`,
          eventCount: sql`${usageDailyRollup.eventCount} + 1`,
          featureCounts: sql`jsonb_set(coalesce(${usageDailyRollup.featureCounts}, '{}'::jsonb), array[${args.feature}], to_jsonb(coalesce((${usageDailyRollup.featureCounts} ->> ${args.feature})::int, 0) + 1))`,
        },
      });
  },

  /** Rollup dalam range tanggal inklusif (untuk usage activity overlay). */
  async listRollupByDateRange(
    db: DbOrTx,
    args: { ownerUserId: string; startDate: string; endDate: string },
  ): Promise<UsageDailyRollupRow[]> {
    return db
      .select()
      .from(usageDailyRollup)
      .where(
        and(
          eq(usageDailyRollup.ownerUserId, args.ownerUserId),
          gte(usageDailyRollup.date, args.startDate),
          lte(usageDailyRollup.date, args.endDate),
        ),
      );
  },
};

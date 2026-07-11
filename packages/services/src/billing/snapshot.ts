import { BillingRepo, type DbOrTx, UserRepo } from "@aqsha/db";
import {
  isAdminEmail,
  isAdminOwnerUserId,
  isSubscriptionExpired,
  normalizeBillingStatus,
  type PlanKey,
} from "../plan";
import type { EntitlementSnapshot } from "./types";

/**
 * Override admin — source of truth = `users.role` (satu DB dibaca semua proses:
 * api/worker/agent), dikelola dari Clerk Dashboard `publicMetadata.role` dan
 * disinkronkan webhook `user.*`. Env allowlist `AQSHA_ADMIN_*` tinggal
 * bootstrap/break-glass (admin pertama / DB belum ter-seed) — BUKAN jalur utama;
 * insiden 2026-07-11: allowlist per-proses drift antar container (api kenal admin,
 * agent tidak) → user admin diblok `subscription_required`.
 */
export async function resolveAdminOverride(
  db: DbOrTx,
  ownerUserId: string,
  ownerEmail?: string | null,
): Promise<{ isAdmin: boolean; email: string | null }> {
  // Bootstrap env (break-glass) — tanpa query DB.
  if (isAdminOwnerUserId(ownerUserId)) return { isAdmin: true, email: ownerEmail ?? null };
  if (isAdminEmail(ownerEmail)) return { isAdmin: true, email: ownerEmail ?? null };

  const user = await UserRepo.findByOwnerUserId(db, ownerUserId);
  const email = ownerEmail ?? user?.email ?? null;
  if (user?.role === "admin") return { isAdmin: true, email };
  // Email fallback tetap lewat env bootstrap (caller tanpa email di context).
  return { isAdmin: isAdminEmail(email), email };
}

/**
 * Snapshot entitlement HOT-PATH (consumeCredits/requireEntitlement): admin override
 * → subscription mirror (billing_subscriptions) → free. **Tanpa network** — di V2
 * mirror ini satu-satunya sumber entitlement (Mayar webhook-synced, tak ada live
 * refresh ke provider; `getBillingSnapshot` membaca mirror yang sama).
 */
export async function getEntitlementSnapshot(
  db: DbOrTx,
  ownerUserId: string,
  ownerEmail?: string | null,
): Promise<EntitlementSnapshot> {
  const admin = await resolveAdminOverride(db, ownerUserId, ownerEmail);
  if (admin.isAdmin) {
    return {
      planKey: "admin",
      status: "admin",
      isAdmin: true,
      isUnlimitedCredits: true,
      currentPeriodEnd: null,
    };
  }

  const sub = await BillingRepo.findLatestSubscriptionByOwner(db, ownerUserId);
  // One-time payment lewat masa berlaku → efektif free (limit/akses/cap turun ke
  // free). Tak ada event Mayar yang menurunkannya, jadi dihitung dari period-end.
  if (!sub || isSubscriptionExpired(sub.currentPeriodEnd)) {
    return {
      planKey: "free",
      status: "free",
      isAdmin: false,
      isUnlimitedCredits: false,
      currentPeriodEnd: null,
    };
  }
  return {
    planKey: sub.planKey as PlanKey,
    status: normalizeBillingStatus(sub.status),
    isAdmin: false,
    isUnlimitedCredits: false,
    currentPeriodEnd: sub.currentPeriodEnd ?? null,
  };
}

/**
 * Plan efektif owner (db-aware) — admin override (users.role) + subscription mirror.
 * Dipakai capacity check Workspace/Artifact (P5): user berbayar dapat cap lebih
 * tinggi, admin unlimited.
 */
export async function resolveEffectivePlanKey(
  db: DbOrTx,
  args: { ownerUserId: string; email?: string | null },
): Promise<PlanKey> {
  const snapshot = await getEntitlementSnapshot(db, args.ownerUserId, args.email);
  return snapshot.planKey;
}

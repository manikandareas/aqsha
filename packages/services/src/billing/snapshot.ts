import { BillingRepo, type DbOrTx, UserRepo } from "@aqsha/db";
import {
  isAdminEmail,
  isAdminOwnerUserId,
  normalizeBillingStatus,
  type PlanKey,
} from "../plan";
import type { EntitlementSnapshot } from "./types";

/**
 * Override admin (port V1 `getAdminBillingOverride`): env allowlist (owner-id /
 * email) → admin_entitlements table (enabled && email ada di allowlist) → email
 * dari users table. Di V2 `ownerUserId == clerkUserId == sub`, jadi owner-id env
 * mencakup keduanya.
 */
export async function resolveAdminOverride(
  db: DbOrTx,
  ownerUserId: string,
  ownerEmail?: string | null,
): Promise<{ isAdmin: boolean; email: string | null }> {
  if (isAdminOwnerUserId(ownerUserId)) return { isAdmin: true, email: ownerEmail ?? null };
  if (isAdminEmail(ownerEmail)) return { isAdmin: true, email: ownerEmail ?? null };

  const mirrored = await BillingRepo.findAdminEntitlement(db, ownerUserId);
  if (mirrored?.enabled && isAdminEmail(mirrored.email)) {
    return { isAdmin: true, email: mirrored.email };
  }

  // Fallback email dari users table bila tak dipassing caller.
  const email = ownerEmail ?? (await UserRepo.findByOwnerUserId(db, ownerUserId))?.email ?? null;
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
  if (!sub) {
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
 * Plan efektif owner (db-aware) — admin override + subscription mirror.
 * **Ganti** `resolvePlanKey` (env-only) di capacity check Workspace/Artifact (P5):
 * user berbayar dapat cap lebih tinggi, admin unlimited.
 */
export async function resolveEffectivePlanKey(
  db: DbOrTx,
  args: { ownerUserId: string; email?: string | null },
): Promise<PlanKey> {
  const snapshot = await getEntitlementSnapshot(db, args.ownerUserId, args.email);
  return snapshot.planKey;
}

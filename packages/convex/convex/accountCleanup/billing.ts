import type { MutationCtx } from "../_generated/server";
import {
  deleteRows,
  type OwnerCleanupResult,
  withinOwnerCleanupLimit,
} from "./shared";

export async function cleanupOwnerBilling(
  ctx: MutationCtx,
  ownerUserId: string,
): Promise<OwnerCleanupResult> {
  let deletedRows = 0;
  const usageLedger = withinOwnerCleanupLimit(
    "usageLedger",
    await ctx.db
      .query("usageLedger")
      .withIndex("by_owner_created", (q) => q.eq("ownerUserId", ownerUserId))
      .take(501),
  );
  const providerUsageLedger = withinOwnerCleanupLimit(
    "providerUsageLedger",
    await ctx.db
      .query("providerUsageLedger")
      .withIndex("by_owner_created", (q) => q.eq("ownerUserId", ownerUserId))
      .take(501),
  );
  const billingSubscriptions = withinOwnerCleanupLimit(
    "billingSubscriptions",
    await ctx.db
      .query("billingSubscriptions")
      .withIndex("by_owner_updated", (q) => q.eq("ownerUserId", ownerUserId))
      .take(501),
  );
  const billingCreditPeriods = withinOwnerCleanupLimit(
    "billingCreditPeriods",
    await ctx.db
      .query("billingCreditPeriods")
      .withIndex("by_owner_period", (q) => q.eq("ownerUserId", ownerUserId))
      .take(501),
  );
  const adminEntitlements = withinOwnerCleanupLimit(
    "adminEntitlements",
    await ctx.db
      .query("adminEntitlements")
      .withIndex("by_owner", (q) => q.eq("ownerUserId", ownerUserId))
      .take(501),
  );

  deletedRows += await deleteRows(ctx, "usageLedger", usageLedger);
  deletedRows += await deleteRows(ctx, "providerUsageLedger", providerUsageLedger);
  deletedRows += await deleteRows(ctx, "billingSubscriptions", billingSubscriptions);
  deletedRows += await deleteRows(ctx, "billingCreditPeriods", billingCreditPeriods);
  deletedRows += await deleteRows(ctx, "adminEntitlements", adminEntitlements);

  return { deletedRows };
}

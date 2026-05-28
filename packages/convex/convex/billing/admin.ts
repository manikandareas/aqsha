import type { MutationCtx, QueryCtx } from "../_generated/server";
import { findUserByOwnerUserId } from "../auth/userRepository";

type BillingCtx = QueryCtx | MutationCtx;

export function parseAdminEmails(value: string | undefined) {
  return new Set(
    (value ?? "")
      .split(",")
      .map((email) => normalizeEmail(email))
      .filter(Boolean),
  );
}

export function isAdminEmail(email: string | null | undefined) {
  if (!email) {
    return false;
  }
  return parseAdminEmails(process.env.AQSHA_ADMIN_EMAILS).has(normalizeEmail(email));
}

export async function getAdminBillingOverride(
  ctx: BillingCtx,
  ownerUserId: string,
  ownerEmail?: string | null,
): Promise<{ isAdmin: boolean; email: string | null }> {
  if (isAdminEmail(ownerEmail)) {
    return { isAdmin: true, email: ownerEmail ?? null };
  }

  const mirrored = await getMirroredAdminEntitlement(ctx, ownerUserId);
  if (mirrored?.enabled && isAdminEmail(mirrored.email)) {
    return { isAdmin: true, email: mirrored.email };
  }

  const user = await findUserByOwnerUserId(ctx, ownerUserId);
  const email = typeof user?.email === "string" ? user.email : null;
  return { isAdmin: isAdminEmail(email), email };
}

async function getMirroredAdminEntitlement(ctx: BillingCtx, ownerUserId: string) {
  return await ctx.db
    .query("adminEntitlements")
    .withIndex("by_owner", (q) => q.eq("ownerUserId", ownerUserId))
    .unique();
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

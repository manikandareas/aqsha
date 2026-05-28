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

export function parseAdminIdentifiers(value: string | undefined) {
  return new Set(
    (value ?? "")
      .split(",")
      .map((identifier) => identifier.trim())
      .filter(Boolean),
  );
}

export function isAdminEmail(email: string | null | undefined) {
  if (!email) {
    return false;
  }
  const normalized = normalizeEmail(email);
  return parseAdminEmails(process.env.AQSHA_ADMIN_EMAILS).has(normalized);
}

export function isAdminOwnerUserId(ownerUserId: string | null | undefined) {
  return hasAdminIdentifier(process.env.AQSHA_ADMIN_OWNER_USER_IDS, ownerUserId);
}

export function isAdminClerkUserId(clerkUserId: string | null | undefined) {
  return hasAdminIdentifier(process.env.AQSHA_ADMIN_CLERK_USER_IDS, clerkUserId);
}

export function isAdminUserDocumentId(userId: string | null | undefined) {
  return hasAdminIdentifier(process.env.AQSHA_ADMIN_USER_IDS, userId)
    || hasAdminIdentifier(process.env.AQSHA_ADMIN_CONVEX_USER_IDS, userId);
}

function hasAdminIdentifier(
  configuredIdentifiers: string | undefined,
  identifier: string | null | undefined,
) {
  if (!identifier) {
    return false;
  }
  return parseAdminIdentifiers(configuredIdentifiers).has(identifier.trim());
}

export async function getAdminBillingOverride(
  ctx: BillingCtx,
  ownerUserId: string,
  ownerEmail?: string | null,
): Promise<{ isAdmin: boolean; email: string | null }> {
  if (isAdminOwnerUserId(ownerUserId)) {
    return { isAdmin: true, email: ownerEmail ?? null };
  }

  if (isAdminEmail(ownerEmail)) {
    return { isAdmin: true, email: ownerEmail ?? null };
  }

  const mirrored = await getMirroredAdminEntitlement(ctx, ownerUserId);
  if (mirrored?.enabled && isAdminEmail(mirrored.email)) {
    return { isAdmin: true, email: mirrored.email };
  }

  const user = await findUserByOwnerUserId(ctx, ownerUserId);
  const email = typeof user?.email === "string" ? user.email : null;
  return {
    isAdmin: isAdminEmail(email)
      || isAdminClerkUserId(user?.clerkUserId)
      || isAdminUserDocumentId(user?._id),
    email,
  };
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

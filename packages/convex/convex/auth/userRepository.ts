import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { AuthCtx, CurrentUser, DbAuthCtx, Identity, UserDoc } from "./types";

const defaultAvatarBaseUrl = "https://api.dicebear.com/9.x/big-ears-neutral/svg";

export async function getAuthenticatedIdentity(ctx: AuthCtx): Promise<Identity> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthenticated");
  }
  return identity;
}

export async function requireCurrentUser(ctx: AuthCtx): Promise<CurrentUser> {
  const identity = await getAuthenticatedIdentity(ctx);

  if (!hasDb(ctx)) {
    return currentUserFromIdentity(identity);
  }

  const user = await findUserByIdentity(ctx, identity);
  if (!user) {
    if (!isMutationCtx(ctx)) {
      return currentUserFromIdentity(identity);
    }
    throw new Error("Authenticated user has not been synced.");
  }

  return currentUserFromDoc(user, identity);
}

export async function ensureCurrentUser(ctx: MutationCtx): Promise<CurrentUser> {
  const identity = await getAuthenticatedIdentity(ctx);
  const existing = await findUserByIdentity(ctx, identity);
  if (existing) {
    await patchUserFromIdentity(ctx, existing, identity);
    return currentUserFromDoc({ ...existing, ...userPatchFromIdentity(existing, identity) }, identity);
  }

  const now = Date.now();
  await ctx.db.insert("users", {
    ownerUserId: identity.tokenIdentifier,
    clerkUserId: identity.subject,
    clerkTokenIdentifier: identity.tokenIdentifier,
    email: identity.email,
    emailVerified: identity.emailVerified === true,
    name: identity.name ?? null,
    image: getIdentityImage(identity) ?? getDefaultAvatarUrl(identity.name ?? identity.email ?? ""),
    createdAt: now,
    updatedAt: now,
  });

  return currentUserFromIdentity(identity);
}

export async function findUserByOwnerUserId(ctx: Pick<QueryCtx, "db">, ownerUserId: string) {
  return await ctx.db
    .query("users")
    .withIndex("by_owner_user_id", (q) => q.eq("ownerUserId", ownerUserId))
    .unique();
}

export async function findUserByClerkUserId(ctx: Pick<QueryCtx, "db">, clerkUserId: string) {
  return await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
    .unique();
}

export async function findUserByClerkTokenIdentifier(
  ctx: Pick<QueryCtx, "db">,
  clerkTokenIdentifier: string,
) {
  return await ctx.db
    .query("users")
    .withIndex("by_clerk_token_identifier", (q) =>
      q.eq("clerkTokenIdentifier", clerkTokenIdentifier),
    )
    .unique();
}

export function currentUserFromDoc(user: UserDoc, identity: Identity): CurrentUser {
  return {
    _id: user.ownerUserId,
    name: user.name ?? identity.name ?? null,
    email: user.email ?? identity.email ?? null,
    emailVerified: user.emailVerified ?? identity.emailVerified === true,
    image: user.image ?? getIdentityImage(identity) ?? null,
    clerkUserId: user.clerkUserId ?? identity.subject,
    clerkTokenIdentifier: user.clerkTokenIdentifier ?? identity.tokenIdentifier,
  };
}

export function getIdentityImage(identity: Identity) {
  return typeof identity.pictureUrl === "string" && identity.pictureUrl.trim()
    ? identity.pictureUrl
    : null;
}

async function findUserByIdentity(ctx: Pick<QueryCtx, "db">, identity: Identity) {
  return (
    (await findUserByClerkTokenIdentifier(ctx, identity.tokenIdentifier)) ??
    (await findUserByClerkUserId(ctx, identity.subject))
  );
}

async function patchUserFromIdentity(ctx: MutationCtx, user: UserDoc, identity: Identity) {
  await ctx.db.patch("users", user._id, userPatchFromIdentity(user, identity));
}

function userPatchFromIdentity(user: UserDoc, identity: Identity) {
  return {
    clerkUserId: identity.subject,
    clerkTokenIdentifier: identity.tokenIdentifier,
    email: identity.email,
    emailVerified: identity.emailVerified === true,
    name: user.name ?? identity.name ?? null,
    image: user.image ?? getIdentityImage(identity),
    updatedAt: Date.now(),
  };
}

function currentUserFromIdentity(identity: Identity): CurrentUser {
  return {
    _id: identity.tokenIdentifier,
    name: identity.name ?? null,
    email: identity.email ?? null,
    emailVerified: identity.emailVerified === true,
    image: getIdentityImage(identity) ?? getDefaultAvatarUrl(identity.name ?? identity.email ?? ""),
    clerkUserId: identity.subject,
    clerkTokenIdentifier: identity.tokenIdentifier,
  };
}

function getDefaultAvatarUrl(seedValue: string) {
  const seed = seedValue.trim() || "Aqsha User";
  return `${defaultAvatarBaseUrl}?seed=${encodeURIComponent(seed)}`;
}

function hasDb(ctx: AuthCtx): ctx is DbAuthCtx {
  return "db" in ctx;
}

function isMutationCtx(ctx: DbAuthCtx): ctx is MutationCtx {
  return "scheduler" in ctx;
}

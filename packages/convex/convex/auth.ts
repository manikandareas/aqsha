import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, mutation, query } from "./_generated/server";
import {
  cleanupOwnerUserData,
  markOwnerUserDeletionFailed as markOwnerUserDeletionFailedHandler,
  type AccountCleanupResult,
} from "./auth/accountDeletion";
import {
  generateAvatarUploadUrl as generateAvatarUploadUrlHandler,
  getCurrentUserProfile,
  setAvatarFromStorage as setAvatarFromStorageHandler,
  syncCurrentUser as syncCurrentUserHandler,
  updateDisplayName as updateDisplayNameHandler,
} from "./auth/profile";
import type { CurrentUser } from "./auth/types";
import { getAuthenticatedIdentity, requireCurrentUser } from "./auth/userRepository";
import {
  processClerkWebhook as processClerkWebhookHandler,
  markClerkUserDeleted as markClerkUserDeletedHandler,
} from "./auth/webhooks";

export type { CurrentUser };
export { requireCurrentUser };

export const syncCurrentUser = mutation({
  args: {},
  returns: v.object({
    id: v.string(),
    clerkUserId: v.string(),
  }),
  handler: async (ctx) => await syncCurrentUserHandler(ctx),
});

export const getCurrentUser = query({
  args: {},
  returns: v.object({
    id: v.string(),
    name: v.union(v.string(), v.null()),
    email: v.union(v.string(), v.null()),
    emailVerified: v.boolean(),
    image: v.union(v.string(), v.null()),
  }),
  handler: async (ctx) => await getCurrentUserProfile(ctx),
});

export const generateAvatarUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => await generateAvatarUploadUrlHandler(ctx),
});

export const updateDisplayName = mutation({
  args: {
    name: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await updateDisplayNameHandler(ctx, args.name);
    return null;
  },
});

export const setAvatarFromStorage = mutation({
  args: {
    storageId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await setAvatarFromStorageHandler(ctx, args.storageId);
    return null;
  },
});

export const deleteCurrentAccount = action({
  args: {},
  returns: v.object({
    ownerUserId: v.string(),
    deletedRows: v.number(),
    deletedStorageObjects: v.number(),
    deletedAgentThreads: v.number(),
  }),
  handler: async (ctx): Promise<AccountCleanupResult> => {
    const identity = await getAuthenticatedIdentity(ctx);
    const cleanupResult: AccountCleanupResult = await ctx.runMutation(
      internal.auth.cleanupOwnerUserDataForDeletion,
      {
        ownerUserId: identity.tokenIdentifier,
      },
    );

    try {
      await deleteClerkUser(identity.subject);
      return cleanupResult;
    } catch (error) {
      await ctx.runMutation(internal.auth.markOwnerUserDeletionFailed, {
        ownerUserId: identity.tokenIdentifier,
        reason:
          error instanceof Error ? error.message : "Unknown Clerk user deletion error.",
      });
      throw error;
    }
  },
});

export const cleanupOwnerUserDataForDeletion = internalMutation({
  args: {
    ownerUserId: v.string(),
  },
  returns: v.object({
    ownerUserId: v.string(),
    deletedRows: v.number(),
    deletedStorageObjects: v.number(),
    deletedAgentThreads: v.number(),
  }),
  handler: async (ctx, args): Promise<AccountCleanupResult> => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_owner_user_id", (q) => q.eq("ownerUserId", args.ownerUserId))
      .unique();

    return await cleanupOwnerUserData(ctx, {
      ownerUserId: args.ownerUserId,
      avatarImage: user?.image ?? null,
    });
  },
});

export const markOwnerUserDeletionFailed = internalMutation({
  args: {
    ownerUserId: v.string(),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await markOwnerUserDeletionFailedHandler(ctx, args);
    return null;
  },
});

export const processClerkWebhook = internalMutation({
  args: {
    eventId: v.string(),
    eventType: v.string(),
    clerkUserId: v.string(),
    email: v.optional(v.union(v.string(), v.null())),
    name: v.optional(v.union(v.string(), v.null())),
    image: v.optional(v.union(v.string(), v.null())),
    deleted: v.optional(v.boolean()),
  },
  returns: v.object({
    processed: v.boolean(),
  }),
  handler: async (ctx, args) => await processClerkWebhookHandler(ctx, args),
});

async function deleteClerkUser(clerkUserId: string) {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    throw new Error("CLERK_SECRET_KEY is not configured in Convex.");
  }

  const response = await fetch(
    `https://api.clerk.com/v1/users/${encodeURIComponent(clerkUserId)}`,
    {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${secretKey}`,
        "content-type": "application/json",
      },
    },
  );

  if (!response.ok && response.status !== 404) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Failed to delete Clerk user (${response.status}).${body ? ` ${body}` : ""}`,
    );
  }
}

export const markClerkUserDeleted = internalMutation({
  args: {
    clerkUserId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await markClerkUserDeletedHandler(ctx, args.clerkUserId);
    return null;
  },
});

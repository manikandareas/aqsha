import {
  createClient,
  type GenericCtx,
} from "@convex-dev/better-auth";
import { isRunMutationCtx } from "@convex-dev/better-auth/utils";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { mutation, query, type ActionCtx, type MutationCtx, type QueryCtx } from "./_generated/server";
import authConfig from "./auth.config";
import {
  assertAvatarStorageFile,
  avatarStorageIdFromImage,
  AVATAR_STORAGE_PREFIX,
  resolveUserImage,
} from "./lib/userImage";
import {
  sendChangeEmailConfirmation,
  sendDeleteAccountVerification,
  sendResetPasswordEmail,
  sendVerificationEmail,
} from "./lib/authEmails";
import {
  configuredSocialProviders,
  getDefaultAvatarUrl,
  getOAuthProviderCapabilities,
  siteUrl,
} from "./lib/authProviders";

export const authComponent = createClient<DataModel>(components.betterAuth);

type AuthCtx = QueryCtx | MutationCtx | ActionCtx;

export async function requireCurrentUser(ctx: AuthCtx) {
  return await authComponent.getAuthUser(ctx);
}

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth({
    baseURL: siteUrl,
    database: authComponent.adapter(ctx),
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (typeof user.image === "string" && user.image.trim()) {
              return { data: user };
            }

            return {
              data: {
                ...user,
                image: getDefaultAvatarUrl(user.name),
              },
            };
          },
        },
      },
    },
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["email-password", "github", "google"],
        allowDifferentEmails: false,
        updateUserInfoOnLink: false,
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail,
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 8,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: sendResetPasswordEmail,
    },
    user: {
      changeEmail: {
        enabled: true,
        sendChangeEmailConfirmation,
      },
      deleteUser: {
        enabled: true,
        sendDeleteAccountVerification,
        beforeDelete: async (user) => {
          await cleanupUserDataBeforeDelete(ctx, user.id, user.image ?? null);
        },
      },
    },
    socialProviders: configuredSocialProviders(),
    plugins: [convex({ authConfig })],
  });
};

async function cleanupUserDataBeforeDelete(
  ctx: GenericCtx<DataModel>,
  ownerUserId: string,
  image: string | null,
) {
  if (isRunMutationCtx(ctx)) {
    await ctx.runMutation(internal.accountCleanup.cleanupUserOwnedData, {
      ownerUserId,
      image,
    });
    return;
  }
  throw new Error("Account cleanup requires a Convex mutation-capable context.");
}

export const getCurrentUser = query({
  args: {},
  returns: v.object({
    id: v.string(),
    name: v.union(v.string(), v.null()),
    email: v.union(v.string(), v.null()),
    emailVerified: v.boolean(),
    image: v.union(v.string(), v.null()),
  }),
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);

    return {
      id: user._id,
      name: user.name ?? null,
      email: user.email ?? null,
      emailVerified: Boolean(user.emailVerified),
      image: await resolveUserImage(ctx, user.image ?? null),
    };
  },
});

export const getSecurityCapabilities = query({
  args: {},
  returns: v.object({
    oauthProviders: v.object({
      github: v.boolean(),
      google: v.boolean(),
    }),
  }),
  handler: async (ctx) => {
    await requireCurrentUser(ctx);
    return {
      oauthProviders: getOAuthProviderCapabilities(),
    };
  },
});

export const getPublicAuthCapabilities = query({
  args: {},
  returns: v.object({
    oauthProviders: v.object({
      github: v.boolean(),
      google: v.boolean(),
    }),
  }),
  handler: async () => {
    return {
      oauthProviders: getOAuthProviderCapabilities(),
    };
  },
});

export const generateAvatarUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireCurrentUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

const maxDisplayNameLength = 120;

export const updateDisplayName = mutation({
  args: {
    name: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireCurrentUser(ctx);

    const name = args.name.trim();
    if (!name) {
      throw new Error("Nama tampilan tidak boleh kosong.");
    }
    if (name.length > maxDisplayNameLength) {
      throw new Error(`Nama tampilan maksimal ${maxDisplayNameLength} karakter.`);
    }

    const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
    await auth.api.updateUser({
      body: { name },
      headers,
    });

    return null;
  },
});

export const setAvatarFromStorage = mutation({
  args: {
    storageId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    await assertAvatarStorageFile(ctx, args.storageId);
    const previousStorageId = avatarStorageIdFromImage(user.image ?? null);

    const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
    await auth.api.updateUser({
      body: {
        image: `${AVATAR_STORAGE_PREFIX}${args.storageId}`,
      },
      headers,
    });

    if (previousStorageId && previousStorageId !== args.storageId) {
      await ctx.storage.delete(previousStorageId);
    }

    return null;
  },
});

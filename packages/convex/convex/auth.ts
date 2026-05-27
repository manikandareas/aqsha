import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { mutation, query, type ActionCtx, type MutationCtx, type QueryCtx } from "./_generated/server";
import authConfig from "./auth.config";
import {
  assertAvatarStorageFile,
  AVATAR_STORAGE_PREFIX,
  deleteAvatarStorageIfPresent,
  resolveUserImage,
} from "./lib/userImage";
import { sendAuthEmail } from "./auth/emailDelivery";
import { getPublicAuthConfiguration, getSocialProviders } from "./auth/providerConfig";

const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";
const defaultAvatarBaseUrl = "https://api.dicebear.com/9.x/big-ears-neutral/svg";

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
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendAuthEmail({
          to: user.email,
          subject: "Verifikasi email Aqsha",
          preview: "Konfirmasi alamat email untuk akun Aqsha kamu.",
          actionUrl: url,
          actionLabel: "Verifikasi email",
        });
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendAuthEmail({
          to: user.email,
          subject: "Reset kata sandi Aqsha",
          preview: "Gunakan tautan ini untuk membuat kata sandi baru.",
          actionUrl: url,
          actionLabel: "Reset kata sandi",
        });
      },
    },
    socialProviders: getSocialProviders(),
    user: {
      changeEmail: {
        enabled: true,
        sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
          await sendAuthEmail({
            to: user.email,
            subject: "Konfirmasi perubahan email Aqsha",
            preview: `Konfirmasi perubahan email akun Aqsha ke ${newEmail}.`,
            actionUrl: url,
            actionLabel: "Konfirmasi perubahan email",
          });
        },
      },
      deleteUser: {
        enabled: true,
        sendDeleteAccountVerification: async ({ user, url }) => {
          await sendAuthEmail({
            to: user.email,
            subject: "Konfirmasi penghapusan akun Aqsha",
            preview: "Tautan ini akan menghapus akun dan data Aqsha kamu secara permanen.",
            actionUrl: url,
            actionLabel: "Hapus akun saya",
          });
        },
        beforeDelete: async (user) => {
          if (!("runMutation" in ctx)) {
            throw new Error("Account deletion requires a mutation-capable context.");
          }
          await ctx.runMutation(internal.accountCleanup.cleanupUserOwnedData, {
            ownerUserId: user.id,
            avatarImage: user.image ?? null,
          });
        },
      },
    },
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["email-password", "github", "google"],
        allowDifferentEmails: false,
        allowUnlinkingAll: false,
        updateUserInfoOnLink: false,
      },
    },
    plugins: [convex({ authConfig })],
  });
};

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
      emailVerified: user.emailVerified ?? false,
      image: await resolveUserImage(ctx, user.image ?? null),
    };
  },
});

export const publicAuthConfiguration = query({
  args: {},
  returns: v.object({
    emailDeliveryConfigured: v.boolean(),
    oauthProviders: v.object({
      github: v.boolean(),
      google: v.boolean(),
    }),
  }),
  handler: async () => {
    return getPublicAuthConfiguration();
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
    const previousImage = user.image ?? null;
    const nextImage = `${AVATAR_STORAGE_PREFIX}${args.storageId}`;

    const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
    await auth.api.updateUser({
      body: {
        image: nextImage,
      },
      headers,
    });
    if (previousImage !== nextImage) {
      await deleteAvatarStorageIfPresent(ctx, previousImage);
    }

    return null;
  },
});

function getDefaultAvatarUrl(name: string) {
  const seed = name.trim() || "Aqsha User";
  return `${defaultAvatarBaseUrl}?seed=${encodeURIComponent(seed)}`;
}

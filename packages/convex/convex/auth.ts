import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { v } from "convex/values";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { mutation, query, type ActionCtx, type MutationCtx, type QueryCtx } from "./_generated/server";
import authConfig from "./auth.config";
import {
  assertAvatarStorageFile,
  AVATAR_STORAGE_PREFIX,
  resolveUserImage,
} from "./lib/userImage";

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
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    plugins: [convex({ authConfig })],
  });
};

function getDefaultAvatarUrl(name: string) {
  const seed = name.trim() || "Aqsha User";
  return `${defaultAvatarBaseUrl}?seed=${encodeURIComponent(seed)}`;
}

export const getCurrentUser = query({
  args: {},
  returns: v.object({
    id: v.string(),
    name: v.union(v.string(), v.null()),
    email: v.union(v.string(), v.null()),
    image: v.union(v.string(), v.null()),
  }),
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);

    return {
      id: user._id,
      name: user.name ?? null,
      email: user.email ?? null,
      image: await resolveUserImage(ctx, user.image ?? null),
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
    await requireCurrentUser(ctx);
    await assertAvatarStorageFile(ctx, args.storageId);

    const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
    await auth.api.updateUser({
      body: {
        image: `${AVATAR_STORAGE_PREFIX}${args.storageId}`,
      },
      headers,
    });

    return null;
  },
});

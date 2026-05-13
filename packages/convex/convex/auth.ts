import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { v } from "convex/values";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { query, type ActionCtx, type MutationCtx, type QueryCtx } from "./_generated/server";
import authConfig from "./auth.config";

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
      image: user.image ?? null,
    };
  },
});

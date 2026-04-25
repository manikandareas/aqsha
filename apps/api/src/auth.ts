import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import * as schema from "@aqsha/db/schema";
import { env } from "./config";
import { database } from "./database/client";

export const auth = betterAuth({
  appName: "Aqsha",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.WEB_ORIGIN],
  database: drizzleAdapter(database, {
    provider: "pg",
    schema: {
      ...schema,
      users: schema.users,
      sessions: schema.sessions,
      accounts: schema.accounts,
      verifications: schema.verifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
  },
  user: {
    modelName: "users",
    fields: {
      image: "avatarUrl",
    },
    additionalFields: {
      onboardingCompletedAt: {
        type: "date",
        required: false,
        input: false,
      },
    },
  },
  session: {
    modelName: "sessions",
  },
  account: {
    modelName: "accounts",
  },
  verification: {
    modelName: "verifications",
  },
  advanced: {
    database: {
      generateId: () => crypto.randomUUID(),
    },
  },
});

export type Auth = typeof auth;
export type AuthSession = typeof auth.$Infer.Session;

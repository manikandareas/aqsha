import type { Doc } from "../_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";

export type AuthCtx = QueryCtx | MutationCtx | ActionCtx;
export type DbAuthCtx = QueryCtx | MutationCtx;
export type Identity = NonNullable<Awaited<ReturnType<QueryCtx["auth"]["getUserIdentity"]>>>;

export type CurrentUser = {
  _id: string;
  name: string | null;
  email: string | null;
  emailVerified: boolean;
  image: string | null;
  clerkUserId: string;
};

export type UserDoc = Doc<"users">;

import type { MutationCtx } from "../_generated/server";
import {
  deleteRows,
  type OwnerCleanupResult,
  withinOwnerCleanupLimit,
} from "./shared";

export async function cleanupOwnerPreferences(
  ctx: MutationCtx,
  ownerUserId: string,
): Promise<OwnerCleanupResult> {
  const userPreferences = withinOwnerCleanupLimit(
    "userPreferences",
    await ctx.db
      .query("userPreferences")
      .withIndex("by_owner", (q) => q.eq("ownerUserId", ownerUserId))
      .take(501),
  );

  return {
    deletedRows: await deleteRows(ctx, "userPreferences", userPreferences),
  };
}

import type { MutationCtx } from "../_generated/server";
import {
  deleteRows,
  type OwnerCleanupResult,
  withinOwnerCleanupLimit,
} from "./shared";

export async function cleanupOwnerWorkspaces(
  ctx: MutationCtx,
  ownerUserId: string,
): Promise<OwnerCleanupResult> {
  let deletedRows = 0;
  const workspaceFolders = withinOwnerCleanupLimit(
    "workspaceFolders",
    await ctx.db
      .query("workspaceFolders")
      .withIndex("by_owner_workspace_status_updated", (q) =>
        q.eq("ownerUserId", ownerUserId),
      )
      .take(501),
  );
  const workspaces = withinOwnerCleanupLimit(
    "workspaces",
    await ctx.db
      .query("workspaces")
      .withIndex("by_owner_updated", (q) => q.eq("ownerUserId", ownerUserId))
      .take(501),
  );

  deletedRows += await deleteRows(ctx, "workspaceFolders", workspaceFolders);
  deletedRows += await deleteRows(ctx, "workspaces", workspaces);

  return { deletedRows };
}

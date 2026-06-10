import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { workspaceEmojiForNewWorkspace } from "./emoji";

const DEFAULT_WORKSPACE_NAME = "Workspace Saya";

export async function ensureDefaultWorkspaceForOwner(
  ctx: MutationCtx,
  ownerUserId: string,
): Promise<Id<"workspaces">> {
  const existing = await ctx.db
    .query("workspaces")
    .withIndex("by_owner_updated", (q) => q.eq("ownerUserId", ownerUserId))
    .order("desc")
    .first();
  if (existing) {
    return existing._id;
  }

  const now = Date.now();
  return await ctx.db.insert("workspaces", {
    ownerUserId,
    name: DEFAULT_WORKSPACE_NAME,
    emoji: workspaceEmojiForNewWorkspace({
      ownerUserId,
      name: DEFAULT_WORKSPACE_NAME,
      now,
    }),
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
}

import { internal } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";
import { findUserByOwnerUserId } from "./userRepository";

export type AccountCleanupResult = {
  ownerUserId: string;
  deletedRows: number;
  deletedStorageObjects: number;
  deletedAgentThreads: number;
};

export async function cleanupOwnerUserData(
  ctx: MutationCtx,
  args: {
    ownerUserId: string;
    avatarImage?: string | null;
  },
): Promise<AccountCleanupResult> {
  const now = Date.now();
  const row = await findUserByOwnerUserId(ctx, args.ownerUserId);
  if (row) {
    await ctx.db.patch("users", row._id, {
      deletionStatus: "deleting",
      deletionRequestedAt: row.deletionRequestedAt ?? now,
      updatedAt: now,
    });
  }

  try {
    const result: Omit<AccountCleanupResult, "ownerUserId"> = await ctx.runMutation(
      internal.accountCleanup.cleanupUserOwnedData,
      {
        ownerUserId: args.ownerUserId,
        avatarImage: args.avatarImage ?? null,
      },
    );

    const completedAt = Date.now();
    if (row) {
      await ctx.db.patch("users", row._id, {
        deletedAt: completedAt,
        deletionStatus: "deleted",
        deletionCompletedAt: completedAt,
        deletionFailedAt: undefined,
        deletionFailureReason: undefined,
        updatedAt: completedAt,
      });
    }

    return {
      ownerUserId: args.ownerUserId,
      ...result,
    };
  } catch (error) {
    const failedAt = Date.now();
    if (row) {
      await ctx.db.patch("users", row._id, {
        deletionStatus: "failed",
        deletionFailedAt: failedAt,
        deletionFailureReason: error instanceof Error ? error.message : "Unknown deletion error.",
        updatedAt: failedAt,
      });
    }
    throw error;
  }
}

export async function markOwnerUserDeletionFailed(
  ctx: MutationCtx,
  args: {
    ownerUserId: string;
    reason: string;
  },
) {
  const row = await findUserByOwnerUserId(ctx, args.ownerUserId);
  if (!row) return;

  const failedAt = Date.now();
  await ctx.db.patch("users", row._id, {
    deletionStatus: "failed",
    deletionFailedAt: failedAt,
    deletionFailureReason: args.reason,
    updatedAt: failedAt,
  });
}

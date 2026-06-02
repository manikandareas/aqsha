import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { cleanupOwnerAgentData } from "./accountCleanup/agent";
import { cleanupOwnerArtifacts } from "./accountCleanup/artifacts";
import { cleanupOwnerBilling } from "./accountCleanup/billing";
import {
  deleteStorageObjects,
  mergeCleanupResults,
  type OwnerCleanupResult,
} from "./accountCleanup/shared";
import { cleanupOwnerWorkspaces } from "./accountCleanup/workspaces";
import { parseAvatarStorageId } from "./lib/userImage";
import type { Id } from "./_generated/dataModel";

export const cleanupUserOwnedData = internalMutation({
  args: {
    ownerUserId: v.string(),
    avatarImage: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.object({
    deletedRows: v.number(),
    deletedStorageObjects: v.number(),
    deletedAgentThreads: v.number(),
  }),
  handler: async (ctx, args) => {
    const storageIds = new Set<Id<"_storage">>();
    const avatarStorageId = parseAvatarStorageId(args.avatarImage);
    if (avatarStorageId) {
      storageIds.add(avatarStorageId);
    }

    const results: OwnerCleanupResult[] = [];
    results.push(await cleanupOwnerAgentData(ctx, args.ownerUserId));
    results.push(await cleanupOwnerArtifacts(ctx, args.ownerUserId, storageIds));
    results.push(await cleanupOwnerWorkspaces(ctx, args.ownerUserId));
    results.push(await cleanupOwnerBilling(ctx, args.ownerUserId));
    results.push({
      deletedRows: 0,
      deletedStorageObjects: await deleteStorageObjects(ctx, storageIds),
    });

    return mergeCleanupResults(results);
  },
});

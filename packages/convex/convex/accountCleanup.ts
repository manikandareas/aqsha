import { ConvexError, v } from "convex/values";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { avatarStorageIdFromImage } from "./lib/userImage";

const maxRowsPerTable = 750;
const maxStorageDeletes = 1_000;

type StorageIdSet = Set<Id<"_storage">>;

type CleanupEntry = {
  tableName: TableNames;
  collectBatch: (
    ctx: MutationCtx,
    ownerUserId: string,
    storageIds: StorageIdSet,
  ) => Promise<CleanupBatch>;
};

type CleanupBatch = {
  tableName: TableNames;
  deleteRows: () => Promise<number>;
};

const cleanupPlan = [
  cleanupEntry("threadMetadata", {
    collect: (ctx, ownerUserId) =>
      ctx.db
        .query("threadMetadata")
        .withIndex("by_owner_activity", (q) => q.eq("ownerUserId", ownerUserId))
        .take(maxRowsPerTable + 1),
  }),
  cleanupEntry("threadContextArtifacts", {
    collect: (ctx, ownerUserId) =>
      ctx.db
        .query("threadContextArtifacts")
        .withIndex("by_owner_thread_created", (q) => q.eq("ownerUserId", ownerUserId))
        .take(maxRowsPerTable + 1),
  }),
  cleanupEntry("workspaces", {
    collect: (ctx, ownerUserId) =>
      ctx.db
        .query("workspaces")
        .withIndex("by_owner_updated", (q) => q.eq("ownerUserId", ownerUserId))
        .take(maxRowsPerTable + 1),
  }),
  cleanupEntry("workspaceFolders", {
    collect: (ctx, ownerUserId) =>
      ctx.db
        .query("workspaceFolders")
        .withIndex("by_owner_workspace_status_updated", (q) =>
          q.eq("ownerUserId", ownerUserId),
        )
        .take(maxRowsPerTable + 1),
  }),
  cleanupEntry("usageLedger", {
    collect: (ctx, ownerUserId) =>
      ctx.db
        .query("usageLedger")
        .withIndex("by_owner_created", (q) => q.eq("ownerUserId", ownerUserId))
        .take(maxRowsPerTable + 1),
  }),
  cleanupEntry("billingSubscriptions", {
    collect: (ctx, ownerUserId) =>
      ctx.db
        .query("billingSubscriptions")
        .withIndex("by_owner_updated", (q) => q.eq("ownerUserId", ownerUserId))
        .take(maxRowsPerTable + 1),
  }),
  cleanupEntry("adminEntitlements", {
    collect: (ctx, ownerUserId) =>
      ctx.db
        .query("adminEntitlements")
        .withIndex("by_owner", (q) => q.eq("ownerUserId", ownerUserId))
        .take(maxRowsPerTable + 1),
  }),
  cleanupEntry("userPreferences", {
    collect: (ctx, ownerUserId) =>
      ctx.db
        .query("userPreferences")
        .withIndex("by_owner", (q) => q.eq("ownerUserId", ownerUserId))
        .take(maxRowsPerTable + 1),
  }),
  cleanupEntry("billingCreditPeriods", {
    collect: (ctx, ownerUserId) =>
      ctx.db
        .query("billingCreditPeriods")
        .withIndex("by_owner_period", (q) => q.eq("ownerUserId", ownerUserId))
        .take(maxRowsPerTable + 1),
  }),
  cleanupEntry("providerUsageLedger", {
    collect: (ctx, ownerUserId) =>
      ctx.db
        .query("providerUsageLedger")
        .withIndex("by_owner_created", (q) => q.eq("ownerUserId", ownerUserId))
        .take(maxRowsPerTable + 1),
  }),
  cleanupEntry("messageCommands", {
    collect: (ctx, ownerUserId) =>
      ctx.db
        .query("messageCommands")
        .withIndex("by_owner_message", (q) => q.eq("ownerUserId", ownerUserId))
        .take(maxRowsPerTable + 1),
  }),
  cleanupEntry("hitlSessions", {
    collect: (ctx, ownerUserId) =>
      ctx.db
        .query("hitlSessions")
        .withIndex("by_owner_thread_phase_created", (q) =>
          q.eq("ownerUserId", ownerUserId),
        )
        .take(maxRowsPerTable + 1),
  }),
  cleanupEntry("hitlCards", {
    collect: (ctx, ownerUserId) =>
      ctx.db
        .query("hitlCards")
        .withIndex("by_owner_session", (q) => q.eq("ownerUserId", ownerUserId))
        .take(maxRowsPerTable + 1),
  }),
  cleanupEntry("messageWorkspaceArtifacts", {
    collect: (ctx, ownerUserId) =>
      ctx.db
        .query("messageWorkspaceArtifacts")
        .withIndex("by_owner_message", (q) => q.eq("ownerUserId", ownerUserId))
        .take(maxRowsPerTable + 1),
  }),
  cleanupEntry("messageWorkspaceActions", {
    collect: (ctx, ownerUserId) =>
      ctx.db
        .query("messageWorkspaceActions")
        .withIndex("by_owner_message", (q) => q.eq("ownerUserId", ownerUserId))
        .take(maxRowsPerTable + 1),
  }),
  cleanupEntry("messageContextArtifacts", {
    collect: (ctx, ownerUserId) =>
      ctx.db
        .query("messageContextArtifacts")
        .withIndex("by_owner_message", (q) => q.eq("ownerUserId", ownerUserId))
        .take(maxRowsPerTable + 1),
  }),
  cleanupEntry("agentRuns", {
    collect: (ctx, ownerUserId) =>
      ctx.db
        .query("agentRuns")
        .withIndex("by_owner_thread_created", (q) => q.eq("ownerUserId", ownerUserId))
        .take(maxRowsPerTable + 1),
  }),
  cleanupEntry("agentRunSteps", {
    collect: (ctx, ownerUserId) =>
      ctx.db
        .query("agentRunSteps")
        .withIndex("by_owner_run", (q) => q.eq("ownerUserId", ownerUserId))
        .take(maxRowsPerTable + 1),
  }),
  cleanupEntry("agentRunEvents", {
    collect: (ctx, ownerUserId) =>
      ctx.db
        .query("agentRunEvents")
        .withIndex("by_owner_run_created", (q) => q.eq("ownerUserId", ownerUserId))
        .take(maxRowsPerTable + 1),
  }),
  cleanupEntry("researchRoundStates", {
    collect: (ctx, ownerUserId) =>
      ctx.db
        .query("researchRoundStates")
        .withIndex("by_owner_run_round", (q) => q.eq("ownerUserId", ownerUserId))
        .take(maxRowsPerTable + 1),
  }),
  cleanupEntry("artifacts", {
    collect: (ctx, ownerUserId) =>
      ctx.db
        .query("artifacts")
        .withIndex("by_owner_thread_created", (q) => q.eq("ownerUserId", ownerUserId))
        .take(maxRowsPerTable + 1),
    collectStorageIds: (artifact, storageIds) => {
      addStorageId(storageIds, artifact.storageId);
    },
  }),
  cleanupEntry("artifactDocuments", {
    collect: (ctx, ownerUserId) =>
      ctx.db
        .query("artifactDocuments")
        .withIndex("by_owner_artifact", (q) => q.eq("ownerUserId", ownerUserId))
        .take(maxRowsPerTable + 1),
    collectStorageIds: (document, storageIds) => {
      addStorageId(storageIds, document.storageId);
      addStorageId(storageIds, document.blocksStorageId);
      addStorageId(storageIds, document.markdownStorageId);
      addStorageId(storageIds, document.uploadStorageId);
    },
  }),
  cleanupEntry("artifactUrls", {
    collect: (ctx, ownerUserId) =>
      ctx.db
        .query("artifactUrls")
        .withIndex("by_owner_artifact", (q) => q.eq("ownerUserId", ownerUserId))
        .take(maxRowsPerTable + 1),
    collectStorageIds: (url, storageIds) => {
      addStorageId(storageIds, url.storageId);
    },
  }),
  cleanupEntry("artifactVersions", {
    collect: (ctx, ownerUserId) =>
      ctx.db
        .query("artifactVersions")
        .withIndex("by_owner_artifact_version", (q) => q.eq("ownerUserId", ownerUserId))
        .take(maxRowsPerTable + 1),
    collectStorageIds: (version, storageIds) => {
      addStorageId(storageIds, version.storageId);
    },
  }),
  cleanupEntry("messageArtifacts", {
    collect: (ctx, ownerUserId) =>
      ctx.db
        .query("messageArtifacts")
        .withIndex("by_owner_message", (q) => q.eq("ownerUserId", ownerUserId))
        .take(maxRowsPerTable + 1),
  }),
  cleanupEntry("citationChecks", {
    collect: (ctx, ownerUserId) =>
      ctx.db
        .query("citationChecks")
        .withIndex("by_owner_artifact", (q) => q.eq("ownerUserId", ownerUserId))
        .take(maxRowsPerTable + 1),
  }),
  cleanupEntry("researchSources", {
    collect: (ctx, ownerUserId) =>
      ctx.db
        .query("researchSources")
        .withIndex("by_owner_thread", (q) => q.eq("ownerUserId", ownerUserId))
        .take(maxRowsPerTable + 1),
  }),
  cleanupEntry("researchExtracts", {
    collect: (ctx, ownerUserId) =>
      ctx.db
        .query("researchExtracts")
        .withIndex("by_owner_run", (q) => q.eq("ownerUserId", ownerUserId))
        .take(maxRowsPerTable + 1),
  }),
] as const;

export const cleanupUserOwnedData = internalMutation({
  args: {
    ownerUserId: v.string(),
    image: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.object({
    deletedRows: v.number(),
    deletedStorageFiles: v.number(),
  }),
  handler: async (ctx, args) => {
    return await cleanupOwnedUserData(ctx, args);
  },
});

export async function cleanupOwnedUserData(
  ctx: MutationCtx,
  args: { ownerUserId: string; image?: string | null },
) {
  const storageIds = new Set<Id<"_storage">>();
  const avatarStorageId = avatarStorageIdFromImage(args.image ?? null);
  if (avatarStorageId) storageIds.add(avatarStorageId);

  const batches: CleanupBatch[] = [];
  for (const entry of cleanupPlan) {
    batches.push(await entry.collectBatch(ctx, args.ownerUserId, storageIds));
  }

  if (storageIds.size > maxStorageDeletes) {
    throw new ConvexError(
      `Account cleanup needs ${storageIds.size} storage deletes, above the ${maxStorageDeletes} bounded limit.`,
    );
  }

  const deletedStorageFiles = await deleteStorageFiles(ctx, storageIds);
  let deletedRows = 0;
  for (const batch of batches) {
    deletedRows += await batch.deleteRows();
  }

  return { deletedRows, deletedStorageFiles };
}

function cleanupEntry<T extends TableNames>(
  tableName: T,
  entry: Omit<CleanupEntryConfig<T>, "tableName">,
): CleanupEntry {
  return {
    tableName,
    collectBatch: async (ctx, ownerUserId, storageIds) => {
      const rows = await limited(tableName, await entry.collect(ctx, ownerUserId));
      for (const row of rows) {
        entry.collectStorageIds?.(row, storageIds);
      }
      return {
        tableName,
        deleteRows: () => deleteRows(ctx, tableName, rows),
      };
    },
  };
}

type CleanupEntryConfig<T extends TableNames> = {
  tableName: T;
  collect: (ctx: MutationCtx, ownerUserId: string) => Promise<Array<Doc<T>>>;
  collectStorageIds?: (row: Doc<T>, storageIds: StorageIdSet) => void;
};

async function limited<T>(tableName: TableNames, rows: T[]): Promise<T[]> {
  if (rows.length > maxRowsPerTable) {
    throw new ConvexError(
      `Account cleanup for ${tableName} is above the ${maxRowsPerTable} row bounded limit.`,
    );
  }
  return rows;
}

async function deleteStorageFiles(ctx: MutationCtx, storageIds: StorageIdSet) {
  let deletedStorageFiles = 0;
  for (const storageId of storageIds) {
    try {
      await ctx.storage.delete(storageId);
      deletedStorageFiles += 1;
    } catch {
      // Missing storage metadata is already equivalent to deleted for account cleanup.
    }
  }
  return deletedStorageFiles;
}

function addStorageId(storageIds: StorageIdSet, storageId?: Id<"_storage">) {
  if (storageId) storageIds.add(storageId);
}

async function deleteRows<T extends TableNames>(
  ctx: MutationCtx,
  tableName: T,
  rows: Array<Doc<T>>,
) {
  for (const row of rows) {
    await ctx.db.delete(tableName, row._id);
  }
  return rows.length;
}

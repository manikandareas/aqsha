import { ConvexError } from "convex/values";
import type { Doc, Id, TableNames } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export const maxRowsPerTable = 500;

export type OwnerCleanupResult = {
  deletedRows: number;
  deletedStorageObjects?: number;
  deletedAgentThreads?: number;
};

export type OwnerCleanupTotals = {
  deletedRows: number;
  deletedStorageObjects: number;
  deletedAgentThreads: number;
};

export function emptyCleanupResult(): OwnerCleanupResult {
  return {
    deletedRows: 0,
  };
}

export function mergeCleanupResults(results: OwnerCleanupResult[]): OwnerCleanupTotals {
  return results.reduce<OwnerCleanupTotals>(
    (total, result) => ({
      deletedRows: total.deletedRows + result.deletedRows,
      deletedStorageObjects:
        total.deletedStorageObjects + (result.deletedStorageObjects ?? 0),
      deletedAgentThreads:
        total.deletedAgentThreads + (result.deletedAgentThreads ?? 0),
    }),
    {
      deletedRows: 0,
      deletedStorageObjects: 0,
      deletedAgentThreads: 0,
    } satisfies OwnerCleanupTotals,
  );
}

export function withinOwnerCleanupLimit<T>(tableName: string, rows: T[]) {
  if (rows.length > maxRowsPerTable) {
    throw new ConvexError(
      `Account deletion needs support cleanup: ${tableName} has more than ${maxRowsPerTable} rows.`,
    );
  }
  return rows;
}

export async function deleteRows<T extends TableNames>(
  ctx: MutationCtx,
  tableName: T,
  rows: Array<Doc<T>>,
) {
  for (const row of rows) {
    await ctx.db.delete(tableName, row._id);
  }
  return rows.length;
}

export function addStorage(
  storageIds: Set<Id<"_storage">>,
  storageId: Id<"_storage"> | undefined,
) {
  if (storageId) {
    storageIds.add(storageId);
  }
}

export async function deleteStorageObjects(ctx: MutationCtx, storageIds: Set<Id<"_storage">>) {
  let deletedStorageObjects = 0;
  for (const storageId of storageIds) {
    await ctx.storage.delete(storageId);
    deletedStorageObjects += 1;
  }
  return deletedStorageObjects;
}

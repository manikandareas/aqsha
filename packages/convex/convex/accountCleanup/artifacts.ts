import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  addStorage,
  deleteRows,
  type OwnerCleanupResult,
  withinOwnerCleanupLimit,
} from "./shared";

export async function cleanupOwnerArtifacts(
  ctx: MutationCtx,
  ownerUserId: string,
  storageIds: Set<Id<"_storage">>,
): Promise<OwnerCleanupResult> {
  let deletedRows = 0;
  const messageContextArtifacts = withinOwnerCleanupLimit(
    "messageContextArtifacts",
    await ctx.db
      .query("messageContextArtifacts")
      .withIndex("by_owner_message", (q) => q.eq("ownerUserId", ownerUserId))
      .take(501),
  );
  const messageArtifacts = withinOwnerCleanupLimit(
    "messageArtifacts",
    await ctx.db
      .query("messageArtifacts")
      .withIndex("by_owner_message", (q) => q.eq("ownerUserId", ownerUserId))
      .take(501),
  );
  const artifactDocuments = withinOwnerCleanupLimit(
    "artifactDocuments",
    await ctx.db
      .query("artifactDocuments")
      .withIndex("by_owner_artifact", (q) => q.eq("ownerUserId", ownerUserId))
      .take(501),
  );
  const artifactUrls = withinOwnerCleanupLimit(
    "artifactUrls",
    await ctx.db
      .query("artifactUrls")
      .withIndex("by_owner_artifact", (q) => q.eq("ownerUserId", ownerUserId))
      .take(501),
  );
  const artifactVersions = withinOwnerCleanupLimit(
    "artifactVersions",
    await ctx.db
      .query("artifactVersions")
      .withIndex("by_owner_artifact_version", (q) => q.eq("ownerUserId", ownerUserId))
      .take(501),
  );
  const artifacts = withinOwnerCleanupLimit(
    "artifacts",
    await ctx.db
      .query("artifacts")
      .withIndex("by_owner_status_updated", (q) => q.eq("ownerUserId", ownerUserId))
      .take(501),
  );

  for (const artifact of artifacts) {
    addStorage(storageIds, artifact.storageId);
  }
  for (const document of artifactDocuments) {
    addStorage(storageIds, document.storageId);
    addStorage(storageIds, document.blocksStorageId);
    addStorage(storageIds, document.markdownStorageId);
    addStorage(storageIds, document.uploadStorageId);
  }
  for (const url of artifactUrls) {
    addStorage(storageIds, url.storageId);
  }
  for (const version of artifactVersions) {
    addStorage(storageIds, version.storageId);
  }

  deletedRows += await deleteRows(ctx, "messageContextArtifacts", messageContextArtifacts);
  deletedRows += await deleteRows(ctx, "messageArtifacts", messageArtifacts);
  deletedRows += await deleteRows(ctx, "artifactDocuments", artifactDocuments);
  deletedRows += await deleteRows(ctx, "artifactUrls", artifactUrls);
  deletedRows += await deleteRows(ctx, "artifactVersions", artifactVersions);
  deletedRows += await deleteRows(ctx, "artifacts", artifacts);

  return { deletedRows };
}

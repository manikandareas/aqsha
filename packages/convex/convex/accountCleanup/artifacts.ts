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
  const artifactContents = withinOwnerCleanupLimit(
    "artifactContents",
    await ctx.db
      .query("artifactContents")
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
  const artifactExtractions = withinOwnerCleanupLimit(
    "artifactExtractions",
    await ctx.db
      .query("artifactExtractions")
      .withIndex("by_owner_artifact_extractor", (q) => q.eq("ownerUserId", ownerUserId))
      .take(501),
  );
  const artifactPaperMetadata = withinOwnerCleanupLimit(
    "artifactPaperMetadata",
    await ctx.db
      .query("artifactPaperMetadata")
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
  for (const document of artifactContents) {
    addStorage(storageIds, document.storageId);
    addStorage(storageIds, document.blocksStorageId);
    addStorage(storageIds, document.markdownStorageId);
  }
  for (const url of artifactUrls) {
    addStorage(storageIds, url.storageId);
  }
  for (const extraction of artifactExtractions) {
    addStorage(storageIds, extraction.inputStorageId);
    addStorage(storageIds, extraction.outputStorageId);
  }
  for (const metadata of artifactPaperMetadata) {
    addStorage(storageIds, metadata.referencesStorageId);
    addStorage(storageIds, metadata.sectionsStorageId);
    addStorage(storageIds, metadata.teiStorageId);
  }
  for (const version of artifactVersions) {
    addStorage(storageIds, version.storageId);
  }

  deletedRows += await deleteRows(ctx, "artifactContents", artifactContents);
  deletedRows += await deleteRows(ctx, "artifactUrls", artifactUrls);
  deletedRows += await deleteRows(ctx, "artifactExtractions", artifactExtractions);
  deletedRows += await deleteRows(ctx, "artifactPaperMetadata", artifactPaperMetadata);
  deletedRows += await deleteRows(ctx, "artifactVersions", artifactVersions);
  deletedRows += await deleteRows(ctx, "artifacts", artifacts);

  return { deletedRows };
}

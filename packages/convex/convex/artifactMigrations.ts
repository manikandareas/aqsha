import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import {
  artifactFamilyForType,
  artifactTypeFromUpload,
  contextFromText,
  previewFromText,
  type ArtifactSource,
  type ArtifactType,
  type IndexingStatus,
} from "./artifactModel";

type LegacyArtifact = Doc<"artifacts"> & {
  kind?: "document" | "url";
  type?: string;
  contentFormat?: string;
};

type LegacyArtifactDocument = Doc<"artifactDocuments"> & {
  uploadStorageId?: Id<"_storage">;
  uploadFileName?: string;
  uploadMimeType?: string;
  uploadSize?: number;
  ingestionStatus?: "pending" | "ready" | "failed";
  ingestionFailureReason?: string;
  ragEntryId?: string;
  indexedAt?: number;
};

export const migrateTypedArtifacts = mutation({
  args: {
    dryRun: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (process.env.ALLOW_TYPED_ARTIFACT_MIGRATION !== "true") {
      throw new ConvexError("Typed artifact migration is disabled");
    }

    const rows = await ctx.db.query("artifacts").take(args.limit ?? 500);
    const now = Date.now();
    let changed = 0;
    let skipped = 0;

    for (const row of rows) {
      const artifact = row as LegacyArtifact;
      const document: LegacyArtifactDocument | null = await ctx.db
        .query("artifactDocuments")
        .withIndex("by_owner_artifact", (q) =>
          q.eq("ownerUserId", artifact.ownerUserId).eq("artifactId", artifact._id),
        )
        .unique();
      const artifactType = inferMigratedArtifactType(artifact, document);
      const source = inferMigratedSource(artifact, document, artifactType);
      const text =
        artifact.contextText ??
        document?.plainText ??
        document?.markdown ??
        artifact.body ??
        "";
      const patch = {
        artifactType,
        artifactFamily: artifactFamilyForType(artifactType),
        source,
        mimeType: artifact.mimeType ?? document?.uploadMimeType,
        fileName: artifact.fileName ?? document?.uploadFileName,
        byteSize: artifact.byteSize ?? document?.uploadSize,
        storageId: artifact.storageId ?? document?.uploadStorageId,
        indexingStatus: inferMigratedIndexingStatus(artifact, document, artifactType),
        indexingFailureReason:
          artifact.indexingFailureReason ?? document?.ingestionFailureReason,
        ragEntryId: artifact.ragEntryId ?? document?.ragEntryId,
        indexedAt: artifact.indexedAt ?? document?.indexedAt,
        plainTextPreview: artifact.plainTextPreview ?? previewFromText(text),
        contextText: artifact.contextText ?? contextFromText(text),
        status: artifact.status ?? "active",
        updatedAt: artifact.updatedAt ?? now,
      };

      if (artifact.artifactType && artifact.indexingStatus && artifact.source) {
        skipped += 1;
        continue;
      }

      changed += 1;
      if (!args.dryRun) {
        await ctx.db.patch("artifacts", artifact._id, patch);
      }
    }

    return { scanned: rows.length, changed, skipped, dryRun: args.dryRun ?? false };
  },
});

function inferMigratedArtifactType(
  artifact: LegacyArtifact,
  document: LegacyArtifactDocument | null,
): ArtifactType {
  if (artifact.artifactType) {
    return artifact.artifactType;
  }
  if (artifact.kind === "url") {
    return "url";
  }

  const mimeType = artifact.mimeType ?? document?.uploadMimeType;
  const fileName = artifact.fileName ?? document?.uploadFileName;
  if (mimeType || fileName) {
    try {
      return artifactTypeFromUpload({
        fileName: fileName ?? artifact.title,
        mimeType: mimeType ?? "application/octet-stream",
      });
    } catch {
      // Fall through to content-based inference.
    }
  }

  if (artifact.contentFormat === "html") return "html";
  if (artifact.contentFormat === "json") return "json";
  if (artifact.contentFormat === "code") return "code";
  if (artifact.contentFormat === "plain") return "plain_text";
  if (document?.blocksJson || document?.markdown) return "markdown";
  return "markdown";
}

function inferMigratedSource(
  artifact: LegacyArtifact,
  document: LegacyArtifactDocument | null,
  artifactType: ArtifactType,
): ArtifactSource {
  if (artifact.source) {
    return artifact.source;
  }
  if (artifactType === "url") {
    return "url";
  }
  if (document?.uploadStorageId || artifact.storageId) {
    return "upload";
  }
  if (artifact.runId) {
    return "agent";
  }
  return "manual";
}

function inferMigratedIndexingStatus(
  artifact: LegacyArtifact,
  document: LegacyArtifactDocument | null,
  artifactType: ArtifactType,
): IndexingStatus {
  if (artifact.indexingStatus) {
    return artifact.indexingStatus;
  }
  if (document?.ingestionStatus) {
    return document.ingestionStatus;
  }
  if (artifact.ragEntryId ?? document?.ragEntryId) {
    return "ready";
  }
  if (artifactType === "url") {
    return "pending";
  }
  if (artifactType === "pdf" || artifactType === "docx") {
    return "pending";
  }
  return "ready";
}

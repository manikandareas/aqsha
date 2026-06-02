import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
} from "./_generated/server";
import {
  artifactRag,
  artifactRagNamespace,
  type ArtifactRagMetadata,
} from "./agent/rag";
import { embeddingProviderConfig } from "./agent/providers";
import {
  ARTIFACT_BODY_INLINE_LIMIT,
  artifactTypeForLegacyArtifact,
  contextFromText,
  previewFromText,
} from "./artifactModel";
import { requireCurrentUser } from "./auth";
import { assertWorkspaceArtifactOwner } from "./workspaceAccess";
import {
  isGrobidEnabled,
  processFulltextPdfWithGrobid,
} from "./paperExtraction/grobidClient";
import {
  parseGrobidTei,
  type ParsedPaperMetadata,
} from "./paperExtraction/teiParser";

const MAX_INDEXED_TEXT_CHARS = 300_000;

const parsedPaperAuthorValidator = v.object({
  name: v.string(),
  affiliation: v.optional(v.string()),
});

const parsedPaperSectionValidator = v.object({
  title: v.optional(v.string()),
  text: v.string(),
});

const parsedPaperReferenceValidator = v.object({
  title: v.optional(v.string()),
  authors: v.optional(v.array(v.string())),
  doi: v.optional(v.string()),
  year: v.optional(v.number()),
});

const parsedPaperMetadataValidator = v.object({
  title: v.optional(v.string()),
  abstract: v.optional(v.string()),
  doi: v.optional(v.string()),
  authors: v.array(parsedPaperAuthorValidator),
  affiliations: v.array(v.string()),
  journal: v.optional(v.string()),
  publisher: v.optional(v.string()),
  publishedYear: v.optional(v.number()),
  keywords: v.array(v.string()),
  sections: v.array(parsedPaperSectionValidator),
  references: v.array(parsedPaperReferenceValidator),
  plainText: v.string(),
  confidence: v.number(),
});

const paperMetadataReturnValidator = v.union(
  v.null(),
  v.object({
    title: v.optional(v.string()),
    abstract: v.optional(v.string()),
    doi: v.optional(v.string()),
    authors: v.array(parsedPaperAuthorValidator),
    affiliations: v.array(v.string()),
    journal: v.optional(v.string()),
    publisher: v.optional(v.string()),
    publishedYear: v.optional(v.number()),
    keywords: v.array(v.string()),
    metadataSource: v.union(
      v.literal("grobid"),
      v.literal("crossref"),
      v.literal("openalex"),
      v.literal("manual"),
      v.literal("llm"),
    ),
    confidence: v.optional(v.number()),
    updatedAt: v.number(),
  }),
);

const extractionReturnValidator = v.union(
  v.null(),
  v.object({
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("ready"),
      v.literal("failed"),
    ),
    failureReason: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    updatedAt: v.number(),
  }),
);

function extractionFailureMessage(error: unknown) {
  return error instanceof Error ? error.message : "GROBID extraction failed";
}

export const getStatus = query({
  args: { artifactId: v.id("artifacts") },
  returns: v.object({
    extraction: extractionReturnValidator,
    metadata: paperMetadataReturnValidator,
  }),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const artifact = await ctx.db.get("artifacts", args.artifactId);
    if (!artifact || artifact.ownerUserId !== user._id) {
      return { extraction: null, metadata: null };
    }
    const [extraction, metadata] = await Promise.all([
      ctx.db
        .query("artifactExtractions")
        .withIndex("by_owner_artifact_extractor", (q) =>
          q
            .eq("ownerUserId", user._id)
            .eq("artifactId", args.artifactId)
            .eq("extractor", "grobid"),
        )
        .unique(),
      ctx.db
        .query("artifactPaperMetadata")
        .withIndex("by_owner_artifact", (q) =>
          q.eq("ownerUserId", user._id).eq("artifactId", args.artifactId),
        )
        .unique(),
    ]);
    return {
      extraction: extraction
        ? {
            status: extraction.status,
            failureReason: extraction.failureReason,
            startedAt: extraction.startedAt,
            completedAt: extraction.completedAt,
            updatedAt: extraction.updatedAt,
          }
        : null,
      metadata: metadata
        ? {
            title: metadata.title,
            abstract: metadata.abstract,
            doi: metadata.doi,
            authors: metadata.authors ?? [],
            affiliations: metadata.affiliations ?? [],
            journal: metadata.journal,
            publisher: metadata.publisher,
            publishedYear: metadata.publishedYear,
            keywords: metadata.keywords ?? [],
            metadataSource: metadata.metadataSource,
            confidence: metadata.confidence,
            updatedAt: metadata.updatedAt,
          }
        : null,
    };
  },
});

export const retryGrobidExtraction = mutation({
  args: { artifactId: v.id("artifacts") },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const artifact = await assertWorkspaceArtifactOwner(ctx, args.artifactId, user._id, {
      requireActive: true,
    });
    if (artifactTypeForLegacyArtifact(artifact) !== "pdf" || !artifact.storageId) {
      throw new ConvexError("Artifact is not an uploaded PDF");
    }
    await ctx.runMutation(internal.paperExtractions.queueGrobidExtraction, {
      ownerUserId: user._id,
      artifactId: args.artifactId,
    });
    return { ok: true };
  },
});

export const queueGrobidExtraction = internalMutation({
  args: {
    ownerUserId: v.string(),
    artifactId: v.id("artifacts"),
  },
  handler: async (ctx, args) => {
    if (!isGrobidEnabled()) {
      return { queued: false };
    }
    const artifact = await ctx.db.get("artifacts", args.artifactId);
    if (
      !artifact ||
      artifact.ownerUserId !== args.ownerUserId ||
      artifact.status !== "active" ||
      artifactTypeForLegacyArtifact(artifact) !== "pdf" ||
      !artifact.storageId
    ) {
      return { queued: false };
    }
    const now = Date.now();
    const attemptId = crypto.randomUUID();
    const existing = await ctx.db
      .query("artifactExtractions")
      .withIndex("by_owner_artifact_extractor", (q) =>
        q
          .eq("ownerUserId", args.ownerUserId)
          .eq("artifactId", args.artifactId)
          .eq("extractor", "grobid"),
      )
      .unique();
    if (existing) {
      await ctx.db.patch("artifactExtractions", existing._id, {
        workspaceId: artifact.workspaceId,
        status: "pending",
        attemptId,
        inputStorageId: artifact.storageId,
        failureReason: undefined,
        startedAt: undefined,
        completedAt: undefined,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("artifactExtractions", {
        ownerUserId: args.ownerUserId,
        artifactId: args.artifactId,
        workspaceId: artifact.workspaceId,
        extractor: "grobid",
        status: "pending",
        attemptId,
        inputStorageId: artifact.storageId,
        createdAt: now,
        updatedAt: now,
      });
    }
    await ctx.scheduler.runAfter(0, internal.paperExtractions.runGrobidExtraction, {
      artifactId: args.artifactId,
      attemptId,
    });
    return { queued: true, attemptId };
  },
});

export const runGrobidExtraction = internalAction({
  args: {
    artifactId: v.id("artifacts"),
    attemptId: v.string(),
  },
  handler: async (ctx, args) => {
    const target = await ctx.runQuery(internal.paperExtractions.getGrobidTarget, {
      artifactId: args.artifactId,
      attemptId: args.attemptId,
    });
    if (!target) {
      return { ok: false, reason: "not_found" };
    }
    await ctx.runMutation(internal.paperExtractions.markGrobidRunning, {
      ownerUserId: target.ownerUserId,
      artifactId: args.artifactId,
      attemptId: args.attemptId,
    });

    try {
      const blob = await ctx.storage.get(target.storageId);
      if (!blob) {
        throw new ConvexError("Uploaded PDF was not found");
      }
      const pdfBytes = new Uint8Array(await blob.arrayBuffer());
      const result = await processFulltextPdfWithGrobid({
        pdfBytes,
        fileName: target.fileName,
      });
      const parsed = parseGrobidTei(result.teiXml);
      const [teiStorageId, sectionsStorageId, referencesStorageId] = await Promise.all([
        storeText(ctx, result.teiXml, "application/xml"),
        storeJson(ctx, parsed.sections),
        storeJson(ctx, parsed.references),
      ]);
      const [plainTextStorageId, markdownStorageId] = await Promise.all([
        maybeStoreLargeText(ctx, parsed.plainText, "text/plain"),
        maybeStoreLargeText(ctx, parsed.plainText, "text/markdown"),
      ]);
      const ragEntryId = await reindexPaperText(ctx, {
        ownerUserId: target.ownerUserId,
        workspaceId: target.workspaceId,
        artifactId: args.artifactId,
        title: parsed.title ?? target.title,
        plainText: parsed.plainText,
      });
      await ctx.runMutation(internal.paperExtractions.markGrobidReady, {
        ownerUserId: target.ownerUserId,
        artifactId: args.artifactId,
        attemptId: args.attemptId,
        teiStorageId,
        sectionsStorageId,
        referencesStorageId,
        parsed,
        plainTextStorageId,
        markdownStorageId,
        ragEntryId,
      });
      return { ok: true, durationMs: result.durationMs };
    } catch (error) {
      const failureReason = extractionFailureMessage(error);
      await ctx.runMutation(internal.paperExtractions.markGrobidFailed, {
        ownerUserId: target.ownerUserId,
        artifactId: args.artifactId,
        attemptId: args.attemptId,
        failureReason,
      });
      return { ok: false, reason: failureReason };
    }
  },
});

export const getGrobidTarget = internalQuery({
  args: {
    artifactId: v.id("artifacts"),
    attemptId: v.string(),
  },
  handler: async (ctx, args) => {
    const artifact = await ctx.db.get("artifacts", args.artifactId);
    if (
      !artifact ||
      artifact.status !== "active" ||
      !artifact.workspaceId ||
      artifactTypeForLegacyArtifact(artifact) !== "pdf" ||
      !artifact.storageId
    ) {
      return null;
    }
    const extraction = await ctx.db
      .query("artifactExtractions")
      .withIndex("by_owner_artifact_extractor", (q) =>
        q
          .eq("ownerUserId", artifact.ownerUserId)
          .eq("artifactId", artifact._id)
          .eq("extractor", "grobid"),
      )
      .unique();
    if (
      !extraction ||
      extraction.attemptId !== args.attemptId ||
      extraction.inputStorageId !== artifact.storageId ||
      (extraction.status !== "pending" && extraction.status !== "running")
    ) {
      return null;
    }
    return {
      ownerUserId: artifact.ownerUserId,
      artifactId: artifact._id,
      workspaceId: artifact.workspaceId,
      storageId: artifact.storageId,
      fileName: artifact.fileName ?? artifact.title,
      title: artifact.title,
    };
  },
});

export const markGrobidRunning = internalMutation({
  args: {
    ownerUserId: v.string(),
    artifactId: v.id("artifacts"),
    attemptId: v.string(),
  },
  handler: async (ctx, args) => {
    const extraction = await getGrobidExtraction(ctx, args);
    if (!extraction) {
      return;
    }
    const now = Date.now();
    await ctx.db.patch("artifactExtractions", extraction._id, {
      status: "running",
      failureReason: undefined,
      startedAt: now,
      completedAt: undefined,
      updatedAt: now,
    });
  },
});

export const markGrobidReady = internalMutation({
  args: {
    ownerUserId: v.string(),
    artifactId: v.id("artifacts"),
    attemptId: v.string(),
    teiStorageId: v.id("_storage"),
    sectionsStorageId: v.id("_storage"),
    referencesStorageId: v.id("_storage"),
    parsed: parsedPaperMetadataValidator,
    plainTextStorageId: v.optional(v.id("_storage")),
    markdownStorageId: v.optional(v.id("_storage")),
    ragEntryId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const artifact = await ctx.db.get("artifacts", args.artifactId);
    if (!artifact || artifact.ownerUserId !== args.ownerUserId || !artifact.workspaceId) {
      throw new ConvexError("Artifact not found");
    }
    const parsed = args.parsed;
    const now = Date.now();
    const scholarly = isLikelyScholarlyPaper(parsed);
    const extraction = await getGrobidExtraction(ctx, args);
    if (!extraction) {
      return;
    }
    const row = await ctx.db
      .query("artifactContents")
      .withIndex("by_owner_artifact", (q) =>
        q.eq("ownerUserId", args.ownerUserId).eq("artifactId", args.artifactId),
      )
      .unique();
    if (!row) {
      throw new ConvexError("Artifact content not found");
    }
    const inlinePlainText =
      parsed.plainText.length <= ARTIFACT_BODY_INLINE_LIMIT ? parsed.plainText : undefined;
    const inlineMarkdown =
      parsed.plainText.length <= ARTIFACT_BODY_INLINE_LIMIT ? parsed.plainText : undefined;

    await upsertPaperMetadataRow(ctx, {
      ownerUserId: args.ownerUserId,
      artifactId: args.artifactId,
      workspaceId: artifact.workspaceId,
      parsed,
      teiStorageId: args.teiStorageId,
      sectionsStorageId: args.sectionsStorageId,
      referencesStorageId: args.referencesStorageId,
      now,
    });
    if (parsed.plainText.trim()) {
      await ctx.db.patch("artifacts", artifact._id, {
        title: parsed.title,
        detectedDocumentKind: scholarly ? "scholarly_paper" : "generic",
        plainTextPreview: parsed.abstract ?? previewFromText(parsed.plainText),
        indexingStatus: "ready",
        indexingFailureReason: undefined,
        ragEntryId: args.ragEntryId ?? artifact.ragEntryId,
        indexedAt: args.ragEntryId ? now : artifact.indexedAt,
        updatedAt: now,
      });
      await ctx.db.patch("artifactContents", row._id, {
        markdown: inlineMarkdown,
        plainText: inlinePlainText,
        contextText: contextFromText(parsed.plainText),
        storageId: args.plainTextStorageId,
        markdownStorageId: args.markdownStorageId,
        updatedAt: now,
      });
    }
    await ctx.db.patch("artifactExtractions", extraction._id, {
      status: "ready",
      outputStorageId: args.teiStorageId,
      outputMimeType: "application/xml",
      failureReason: undefined,
      completedAt: now,
      updatedAt: now,
    });
  },
});

export const markGrobidFailed = internalMutation({
  args: {
    ownerUserId: v.string(),
    artifactId: v.id("artifacts"),
    attemptId: v.string(),
    failureReason: v.string(),
  },
  handler: async (ctx, args) => {
    const extraction = await getGrobidExtraction(ctx, args);
    if (!extraction) {
      return;
    }
    const now = Date.now();
    await ctx.db.patch("artifactExtractions", extraction._id, {
      status: "failed",
      failureReason: args.failureReason.slice(0, 1_000),
      completedAt: now,
      updatedAt: now,
    });
  },
});

export const upsertPaperMetadata = internalMutation({
  args: {
    ownerUserId: v.string(),
    artifactId: v.id("artifacts"),
    workspaceId: v.id("workspaces"),
    parsed: parsedPaperMetadataValidator,
    teiStorageId: v.id("_storage"),
    sectionsStorageId: v.id("_storage"),
    referencesStorageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    await upsertPaperMetadataRow(ctx, {
      ...args,
      now: Date.now(),
    });
  },
});

async function getGrobidExtraction(
  ctx: MutationCtx,
  args: { ownerUserId: string; artifactId: Id<"artifacts">; attemptId: string },
) {
  const extraction = await ctx.db
    .query("artifactExtractions")
    .withIndex("by_owner_artifact_extractor", (q) =>
      q
        .eq("ownerUserId", args.ownerUserId)
        .eq("artifactId", args.artifactId)
        .eq("extractor", "grobid"),
    )
    .unique();
  return extraction?.attemptId === args.attemptId ? extraction : null;
}

async function upsertPaperMetadataRow(
  ctx: MutationCtx,
  args: {
    ownerUserId: string;
    artifactId: Id<"artifacts">;
    workspaceId: Id<"workspaces">;
    parsed: ParsedPaperMetadata;
    teiStorageId: Id<"_storage">;
    sectionsStorageId: Id<"_storage">;
    referencesStorageId: Id<"_storage">;
    now: number;
  },
) {
  const existing = await ctx.db
    .query("artifactPaperMetadata")
    .withIndex("by_owner_artifact", (q) =>
      q.eq("ownerUserId", args.ownerUserId).eq("artifactId", args.artifactId),
    )
    .unique();
  const patch = {
    workspaceId: args.workspaceId,
    title: args.parsed.title,
    abstract: args.parsed.abstract,
    doi: args.parsed.doi,
    authors: args.parsed.authors,
    affiliations: args.parsed.affiliations,
    journal: args.parsed.journal,
    publisher: args.parsed.publisher,
    publishedYear: args.parsed.publishedYear,
    keywords: args.parsed.keywords,
    referencesStorageId: args.referencesStorageId,
    sectionsStorageId: args.sectionsStorageId,
    teiStorageId: args.teiStorageId,
    metadataSource: "grobid" as const,
    confidence: args.parsed.confidence,
    updatedAt: args.now,
  };
  if (existing) {
    await ctx.db.patch("artifactPaperMetadata", existing._id, patch);
    return;
  }
  await ctx.db.insert("artifactPaperMetadata", {
    ownerUserId: args.ownerUserId,
    artifactId: args.artifactId,
    createdAt: args.now,
    ...patch,
  });
}

function isLikelyScholarlyPaper(parsed: ParsedPaperMetadata) {
  return Boolean(
    parsed.doi ||
      (parsed.title && parsed.abstract && parsed.authors.length > 0) ||
      (parsed.authors.length > 0 && parsed.references.length >= 3),
  );
}

async function storeText(ctx: ActionCtx, value: string, type: string) {
  return await ctx.storage.store(new Blob([value], { type }));
}

async function maybeStoreLargeText(ctx: ActionCtx, value: string, type: string) {
  if (value.length <= 700_000) {
    return undefined;
  }
  return await storeText(ctx, value, type);
}

async function storeJson(ctx: ActionCtx, value: unknown) {
  return await storeText(ctx, JSON.stringify(value), "application/json");
}

async function reindexPaperText(
  ctx: ActionCtx,
  args: {
    ownerUserId: string;
    workspaceId: Id<"workspaces">;
    artifactId: Id<"artifacts">;
    title: string;
    plainText: string;
  },
) {
  const indexedText = args.plainText.slice(0, MAX_INDEXED_TEXT_CHARS);
  if (!indexedText.trim() || !embeddingProviderConfig.enabled) {
    return undefined;
  }
  try {
    const result = await artifactRag.add(ctx, {
      namespace: artifactRagNamespace(args.ownerUserId),
      key: `artifact:${args.artifactId}`,
      title: args.title,
      text: indexedText,
      filterValues: [
        { name: "artifactId", value: String(args.artifactId) },
        { name: "workspaceId", value: String(args.workspaceId) },
      ],
      metadata: {
        artifactId: String(args.artifactId),
        workspaceId: String(args.workspaceId),
        ownerUserId: args.ownerUserId,
        source: "upload",
      } satisfies ArtifactRagMetadata,
    });
    return String(result.entryId);
  } catch (error) {
    console.warn("Failed to reindex GROBID paper text", error);
    return undefined;
  }
}

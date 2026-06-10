import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
} from "../_generated/server";
import {
  artifactRag,
  artifactRagNamespace,
  type ArtifactRagMetadata,
} from "../agent/context/rag";
import { embeddingProviderConfig } from "../agent/providers/providers";
import {
  ARTIFACT_BODY_INLINE_LIMIT,
  artifactTypeForLegacyArtifact,
  contextFromText,
  previewFromText,
} from "../artifacts/model";
import { requireCurrentUser } from "../auth";
import { throwAppError } from "../lib/appError";
import { assertWorkspaceArtifactOwner } from "../workspaces/access";
import {
  isGrobidEnabled,
  processFulltextPdfWithGrobid,
} from "./grobid/grobidClient";
import {
  parseGrobidTei,
  type ParsedPaperMetadata,
} from "./grobid/teiParser";

const MAX_INDEXED_TEXT_CHARS = 300_000;

// The GROBID server is frequently transiently overloaded (502 / gateway
// timeouts). Re-queue a few times with backoff before giving up so a single
// busy moment doesn't permanently lose a paper's structured metadata.
const MAX_GROBID_ATTEMPTS = 3;
const GROBID_RETRY_BASE_DELAY_MS = 20_000;

function isTransientGrobidError(reason: string): boolean {
  return /abort|timed?\s*out|timeout|50\d|bad gateway|gateway time|network|fetch failed|econn|socket/i.test(
    reason,
  );
}

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
      v.literal("arxiv"),
      v.literal("datacite"),
      v.literal("semantic_scholar"),
      v.literal("manual"),
      v.literal("llm"),
    ),
    arxivId: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    oaStatus: v.optional(v.string()),
    pdfStatus: v.optional(
      v.union(v.literal("downloaded"), v.literal("no_oa_available")),
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
  // Unwrap structured app errors so the persisted `failureReason` stays a plain
  // human-readable string rather than a serialized JSON payload.
  if (error instanceof ConvexError) {
    const data = error.data;
    if (data && typeof data === "object" && typeof data.message === "string") {
      return data.message;
    }
    return typeof data === "string" ? data : "GROBID extraction failed";
  }
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
            arxivId: metadata.arxivId,
            sourceUrl: metadata.sourceUrl,
            oaStatus: metadata.oaStatus,
            pdfStatus: metadata.pdfStatus,
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
      throwAppError({
        message: "Artifact is not an uploaded PDF",
        code: "artifact_not_uploaded_pdf",
      });
    }
    await ctx.runMutation(internal.papers.extractions.queueGrobidExtraction, {
      ownerUserId: user._id,
      artifactId: args.artifactId,
    });
    return { ok: true };
  },
});

const resolvedMetadataSourceValidator = v.union(
  v.literal("crossref"),
  v.literal("openalex"),
  v.literal("arxiv"),
  v.literal("datacite"),
  v.literal("semantic_scholar"),
  // First-page LLM fallback for uploaded PDFs that carry no DOI/arXiv id.
  v.literal("llm"),
);

// Relative quality of each metadata source. A weaker source must never
// overwrite a row written by a stronger one (e.g. an LLM guess must not clobber
// authoritative Crossref/GROBID data), regardless of arrival order.
const METADATA_SOURCE_RANK: Record<string, number> = {
  manual: 4,
  grobid: 3,
  crossref: 2,
  openalex: 2,
  arxiv: 2,
  datacite: 2,
  semantic_scholar: 2,
  llm: 1,
};

/**
 * Persist DOI/identifier-derived paper metadata for a URL/Explore-sourced
 * artifact. Runs BEFORE (and independently of) GROBID so the paper sidebar
 * works even when GROBID is disabled or no PDF is available; GROBID later
 * upserts the same row with richer, structured data.
 */
export const upsertResolvedPaperMetadata = internalMutation({
  args: {
    ownerUserId: v.string(),
    artifactId: v.id("artifacts"),
    metadataSource: resolvedMetadataSourceValidator,
    title: v.optional(v.string()),
    abstract: v.optional(v.string()),
    doi: v.optional(v.string()),
    arxivId: v.optional(v.string()),
    authors: v.optional(v.array(parsedPaperAuthorValidator)),
    affiliations: v.optional(v.array(v.string())),
    journal: v.optional(v.string()),
    publisher: v.optional(v.string()),
    publishedYear: v.optional(v.number()),
    keywords: v.optional(v.array(v.string())),
    sourceUrl: v.optional(v.string()),
    oaStatus: v.optional(v.string()),
    pdfStatus: v.optional(
      v.union(v.literal("downloaded"), v.literal("no_oa_available")),
    ),
    confidence: v.optional(v.number()),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const artifact = await ctx.db.get("artifacts", args.artifactId);
    if (
      !artifact ||
      artifact.ownerUserId !== args.ownerUserId ||
      artifact.status !== "active" ||
      !artifact.workspaceId
    ) {
      return { ok: false };
    }
    const now = Date.now();
    const existing = await ctx.db
      .query("artifactPaperMetadata")
      .withIndex("by_owner_artifact", (q) =>
        q.eq("ownerUserId", args.ownerUserId).eq("artifactId", args.artifactId),
      )
      .unique();
    // Never downgrade a richer source (GROBID/Crossref) with a weaker one (LLM).
    if (
      existing &&
      (METADATA_SOURCE_RANK[args.metadataSource] ?? 0) <
        (METADATA_SOURCE_RANK[existing.metadataSource] ?? 0)
    ) {
      return { ok: true };
    }
    // Only overwrite fields the caller actually provided. A weaker/equal-rank
    // re-run (e.g. the upload-enrichment resolver re-resolving a URL-sourced
    // paper) must not clobber provenance an earlier pass persisted but this
    // caller omits — `ctx.db.patch` deletes any key set to `undefined`.
    const patch = {
      workspaceId: artifact.workspaceId,
      metadataSource: args.metadataSource,
      updatedAt: now,
      ...(args.title !== undefined ? { title: args.title } : {}),
      ...(args.abstract !== undefined ? { abstract: args.abstract } : {}),
      ...(args.doi !== undefined ? { doi: args.doi } : {}),
      ...(args.arxivId !== undefined ? { arxivId: args.arxivId } : {}),
      ...(args.authors !== undefined ? { authors: args.authors } : {}),
      ...(args.affiliations !== undefined ? { affiliations: args.affiliations } : {}),
      ...(args.journal !== undefined ? { journal: args.journal } : {}),
      ...(args.publisher !== undefined ? { publisher: args.publisher } : {}),
      ...(args.publishedYear !== undefined ? { publishedYear: args.publishedYear } : {}),
      ...(args.keywords !== undefined ? { keywords: args.keywords } : {}),
      ...(args.sourceUrl !== undefined ? { sourceUrl: args.sourceUrl } : {}),
      ...(args.oaStatus !== undefined ? { oaStatus: args.oaStatus } : {}),
      ...(args.pdfStatus !== undefined ? { pdfStatus: args.pdfStatus } : {}),
      ...(args.confidence !== undefined ? { confidence: args.confidence } : {}),
    };
    if (existing) {
      await ctx.db.patch("artifactPaperMetadata", existing._id, patch);
    } else {
      await ctx.db.insert("artifactPaperMetadata", {
        ownerUserId: args.ownerUserId,
        artifactId: args.artifactId,
        createdAt: now,
        authors: args.authors ?? [],
        affiliations: args.affiliations ?? [],
        keywords: args.keywords ?? [],
        ...patch,
      });
    }
    return { ok: true };
  },
});

/**
 * Classify an artifact's document kind on the `artifacts` row. Used by the
 * upload-enrichment path so a paper whose metadata was resolved (DOI/arXiv or
 * LLM) is marked `scholarly_paper` even when GROBID never runs or fails — the
 * `artifacts` row is the source of truth the rest of the app reads from.
 */
export const setArtifactDetectedKind = internalMutation({
  args: {
    ownerUserId: v.string(),
    artifactId: v.id("artifacts"),
    detectedDocumentKind: v.union(
      v.literal("generic"),
      v.literal("scholarly_paper"),
    ),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const artifact = await ctx.db.get("artifacts", args.artifactId);
    if (
      !artifact ||
      artifact.ownerUserId !== args.ownerUserId ||
      artifact.status !== "active"
    ) {
      return { ok: false };
    }
    if (artifact.detectedDocumentKind === args.detectedDocumentKind) {
      return { ok: true };
    }
    await ctx.db.patch("artifacts", args.artifactId, {
      detectedDocumentKind: args.detectedDocumentKind,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const queueGrobidExtraction = internalMutation({
  args: {
    ownerUserId: v.string(),
    artifactId: v.id("artifacts"),
    attempt: v.optional(v.number()),
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
    await ctx.scheduler.runAfter(0, internal.papers.extractions.runGrobidExtraction, {
      artifactId: args.artifactId,
      attemptId,
      attempt: args.attempt ?? 1,
    });
    return { queued: true, attemptId };
  },
});

export const runGrobidExtraction = internalAction({
  args: {
    artifactId: v.id("artifacts"),
    attemptId: v.string(),
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const target = await ctx.runQuery(internal.papers.extractions.getGrobidTarget, {
      artifactId: args.artifactId,
      attemptId: args.attemptId,
    });
    if (!target) {
      return { ok: false, reason: "not_found" };
    }
    await ctx.runMutation(internal.papers.extractions.markGrobidRunning, {
      ownerUserId: target.ownerUserId,
      artifactId: args.artifactId,
      attemptId: args.attemptId,
    });

    try {
      const blob = await ctx.storage.get(target.storageId);
      if (!blob) {
        throwAppError({
          message: "Uploaded PDF was not found",
          code: "artifact_pdf_not_found",
        });
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
      await ctx.runMutation(internal.papers.extractions.markGrobidReady, {
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
      const attempt = args.attempt ?? 1;
      // Re-queue transient GROBID failures (overloaded server / gateway
      // timeouts) with backoff before marking the extraction failed.
      if (isTransientGrobidError(failureReason) && attempt < MAX_GROBID_ATTEMPTS) {
        await ctx.scheduler.runAfter(
          GROBID_RETRY_BASE_DELAY_MS * attempt,
          internal.papers.extractions.queueGrobidExtraction,
          {
            ownerUserId: target.ownerUserId,
            artifactId: args.artifactId,
            attempt: attempt + 1,
          },
        );
        return { ok: false, reason: failureReason, retrying: true };
      }
      await ctx.runMutation(internal.papers.extractions.markGrobidFailed, {
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
      throwAppError({
        message: "Artifact not found",
        code: "artifact_not_found",
      });
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
      throwAppError({
        message: "Artifact content not found",
        code: "artifact_content_not_found",
      });
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
        // Never downgrade: a thin GROBID parse must not flip a paper already
        // classified `scholarly_paper` (by an earlier GROBID pass or by the
        // identifier/LLM enrichment path) back to `generic`.
        detectedDocumentKind:
          scholarly || artifact.detectedDocumentKind === "scholarly_paper"
            ? "scholarly_paper"
            : "generic",
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

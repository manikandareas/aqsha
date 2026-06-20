import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { internalAction, type ActionCtx } from "../../_generated/server";
import { ARTIFACT_BODY_INLINE_LIMIT } from "../../artifacts/model";
import { rateLimiter } from "../../limits";
import { readWithJinaReader } from "../../agent/providers/externalProviders";
import { downloadOaPdf } from "./download";
import { classifyUrl, isAcademicIdentifier } from "./identifiers";
import { resolvePaper, type ResolvedPaper } from "./resolve";

type UrlTarget = {
  ownerUserId: string;
  workspaceId: Id<"workspaces">;
  title: string;
  originalUrl: string;
  normalizedUrl: string;
  siteName?: string;
};

/**
 * Ingest a freshly-created `url` artifact. Detects whether the URL is an
 * academic paper (DOI / arXiv / PMID); if so it resolves bibliographic
 * metadata, downloads the open-access PDF when available, and runs the artifact
 * through the SAME extraction/GROBID pipeline as an uploaded PDF. Non-academic
 * URLs are crawled into readable markdown (Jina Reader).
 */
export const ingestUrl = internalAction({
  args: { artifactId: v.id("artifacts") },
  returns: v.object({
    ok: v.boolean(),
    mode: v.optional(v.string()),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const target = (await ctx.runQuery(
      internal.artifacts.getUrlExtractionTarget,
      { artifactId: args.artifactId },
    )) as UrlTarget | null;
    if (!target) {
      return { ok: false, reason: "not_found" };
    }

    // Advisory per-user gate (does not hard-fail the ingestion).
    await rateLimiter.limit(ctx, "paperIngestPerUser", { key: target.ownerUserId });

    try {
      const classified = classifyUrl(target.originalUrl || target.normalizedUrl);

      if (!isAcademicIdentifier(classified)) {
        await crawlGeneric(ctx, args.artifactId, target);
        return { ok: true, mode: "webpage" };
      }

      const resolved = await resolvePaper(ctx, { classified });
      if (!resolved) {
        // Looked academic but nothing resolved — fall back to a plain crawl.
        await crawlGeneric(ctx, args.artifactId, target);
        return { ok: true, mode: "webpage_fallback" };
      }

      const pdf = await downloadOaPdf(ctx, {
        ownerUserId: target.ownerUserId,
        candidates: resolved.pdfCandidates,
      });

      if (pdf) {
        const fileName = pdfFileName(resolved);
        await ctx.runMutation(internal.artifacts.convertUrlArtifactToPdf, {
          ownerUserId: target.ownerUserId,
          artifactId: args.artifactId,
          storageId: pdf.storageId,
          fileName,
          byteSize: pdf.byteSize,
          title: resolved.title,
        });
        await writeResolvedMetadata(ctx, args.artifactId, target, resolved, {
          pdfStatus: "downloaded",
          sourceUrl: pdf.sourceUrl,
        });
        // Extract text + queue GROBID via the shared (Node) upload pipeline.
        await ctx.scheduler.runAfter(
          0,
          internal.artifacts.uploads.finalizeStoredArtifact,
          {
            ownerUserId: target.ownerUserId,
            artifactId: args.artifactId,
            title: resolved.title ?? target.title,
            storageId: pdf.storageId,
            fileName,
            mimeType: "application/pdf",
            workspaceId: target.workspaceId,
          },
        );
        return { ok: true, mode: "paper_pdf" };
      }

      // No open-access PDF — keep it a URL artifact but surface paper metadata.
      await ctx.runMutation(internal.artifacts.markUrlPaperMetadataOnly, {
        ownerUserId: target.ownerUserId,
        artifactId: args.artifactId,
        title: resolved.title ?? target.title,
        abstract: resolved.abstract,
        siteName: target.siteName,
      });
      await writeResolvedMetadata(ctx, args.artifactId, target, resolved, {
        pdfStatus: "no_oa_available",
        sourceUrl: resolved.landingPageUrl,
      });
      return { ok: true, mode: "paper_metadata_only" };
    } catch (error) {
      await ctx.runMutation(internal.artifacts.patchUrlExtractionFailed, {
        ownerUserId: target.ownerUserId,
        artifactId: args.artifactId,
        failureReason:
          error instanceof Error ? error.message : "Ingestion failed",
      });
      return { ok: false, reason: "error" };
    }
  },
});

async function crawlGeneric(
  ctx: ActionCtx,
  artifactId: Id<"artifacts">,
  target: UrlTarget,
): Promise<void> {
  // Jina Reader (single-URL → markdown). Exa was removed from ingest (D3);
  // Jina is the sole crawler now. Exa stays exported for the AI agent only.
  const read = await readWithJinaReader(ctx, {
    ownerUserId: target.ownerUserId,
    url: target.normalizedUrl,
  });

  if (!read.ok) {
    await ctx.runMutation(internal.artifacts.patchUrlExtractionFailed, {
      ownerUserId: target.ownerUserId,
      artifactId,
      failureReason: read.failureReason ?? "URL extraction failed",
    });
    return;
  }

  const storageId =
    read.markdown.length > ARTIFACT_BODY_INLINE_LIMIT
      ? await ctx.storage.store(
          new Blob([read.markdown], { type: "text/markdown" }),
        )
      : undefined;
  await ctx.runMutation(internal.artifacts.patchUrlExtractionReady, {
    ownerUserId: target.ownerUserId,
    artifactId,
    title: read.title || target.title,
    description: read.snippet || undefined,
    siteName: target.siteName,
    readableText: read.markdown,
    storageId,
  });
}

async function writeResolvedMetadata(
  ctx: ActionCtx,
  artifactId: Id<"artifacts">,
  target: UrlTarget,
  resolved: ResolvedPaper,
  extra: { pdfStatus: "downloaded" | "no_oa_available"; sourceUrl?: string },
): Promise<void> {
  await ctx.runMutation(internal.papers.extractions.upsertResolvedPaperMetadata, {
    ownerUserId: target.ownerUserId,
    artifactId,
    metadataSource: resolved.metadataSource,
    title: resolved.title,
    abstract: resolved.abstract,
    doi: resolved.doi,
    arxivId: resolved.arxivId,
    authors: resolved.authors,
    affiliations: resolved.affiliations,
    journal: resolved.journal,
    publisher: resolved.publisher,
    publishedYear: resolved.publishedYear,
    sourceUrl: extra.sourceUrl,
    oaStatus: resolved.oaStatus,
    pdfStatus: extra.pdfStatus,
  });
}

function pdfFileName(resolved: ResolvedPaper): string {
  const base = String(
    resolved.arxivId || resolved.doi || resolved.title || "paper",
  );
  const safe = base.replace(/[^\w.-]+/g, "_").slice(0, 80) || "paper";
  return safe.toLowerCase().endsWith(".pdf") ? safe : `${safe}.pdf`;
}

import {
  ArtifactService,
  classifyUrl,
  downloadOaPdf,
  isAcademicIdentifier,
  PaperMetadataService,
  pdfFileName,
  readWithJinaReader,
  resolvePaper,
  type ResolvedPaper,
} from "@aqsha/services";
import type { Job } from "bullmq";
import { getDb } from "../clients/db";

export type UrlIngestionJob = { ownerUserId: string; artifactId: string };

const RESOLVER_CONFIDENCE = 0.95;

type IngestTarget = {
  workspaceId: string;
  originalUrl: string;
  normalizedUrl: string;
  title: string;
  siteName: string;
};

/**
 * Worker `url-ingestion` (port V1 `ingest.ts`): classify → generik (Jina crawl) /
 * akademik (resolve → OA PDF download→convert→extract / else metadata-only). Metadata
 * resolver ditulis via PaperMetadataService (monotonik rank).
 */
export async function processUrlIngestion(job: Job<UrlIngestionJob>): Promise<void> {
  const { db } = getDb();
  const { ownerUserId, artifactId } = job.data;
  const target = await ArtifactService.getUrlIngestTarget(db, ownerUserId, artifactId);
  if (!target) return;

  const classified = classifyUrl(target.originalUrl || target.normalizedUrl);
  if (!isAcademicIdentifier(classified)) {
    await crawlGeneric(ownerUserId, artifactId, target);
    return;
  }

  const resolved = await resolvePaper({ classified });
  if (!resolved) {
    await crawlGeneric(ownerUserId, artifactId, target);
    return;
  }

  const pdf = await downloadOaPdf({ candidates: resolved.pdfCandidates });
  if (pdf) {
    await ArtifactService.ingestResolvedPdf(db, {
      ownerUserId,
      artifactId,
      workspaceId: target.workspaceId,
      bytes: pdf.bytes,
      byteSize: pdf.byteSize,
      fileName: pdfFileName(resolved),
      title: resolved.title ?? target.title,
    });
    await writeResolvedMetadata(ownerUserId, artifactId, target.workspaceId, resolved, {
      sourceUrl: pdf.sourceUrl,
      pdfStatus: "downloaded",
    });
  } else {
    await ArtifactService.markUrlPaperMetadataOnly(db, {
      ownerUserId,
      artifactId,
      title: resolved.title ?? target.title,
      abstract: resolved.abstract,
      siteName: target.siteName,
    });
    await writeResolvedMetadata(ownerUserId, artifactId, target.workspaceId, resolved, {
      sourceUrl: resolved.landingPageUrl,
      pdfStatus: "no_oa_available",
    });
  }
}

async function crawlGeneric(
  ownerUserId: string,
  artifactId: string,
  target: IngestTarget,
): Promise<void> {
  const { db } = getDb();
  const read = await readWithJinaReader({ url: target.normalizedUrl });
  if (!read.ok) {
    await ArtifactService.markUrlFailed(db, {
      ownerUserId,
      artifactId,
      failureReason: read.failureReason ?? "URL extraction failed",
    });
    return;
  }
  await ArtifactService.markUrlReady(db, {
    ownerUserId,
    artifactId,
    title: read.title || target.title,
    description: read.snippet || undefined,
    siteName: target.siteName,
    readableText: read.markdown,
  });
}

async function writeResolvedMetadata(
  ownerUserId: string,
  artifactId: string,
  workspaceId: string,
  resolved: ResolvedPaper,
  extra: { sourceUrl?: string; pdfStatus: "downloaded" | "no_oa_available" },
): Promise<void> {
  const { db } = getDb();
  await PaperMetadataService.upsert(db, {
    ownerUserId,
    artifactId,
    workspaceId,
    metadataSource: resolved.metadataSource,
    title: resolved.title,
    abstract: resolved.abstract,
    doi: resolved.doi,
    authors: resolved.authors,
    affiliations: resolved.affiliations,
    journal: resolved.journal,
    publisher: resolved.publisher,
    publishedYear: resolved.publishedYear,
    arxivId: resolved.arxivId,
    sourceUrl: extra.sourceUrl,
    oaStatus: resolved.oaStatus,
    pdfStatus: extra.pdfStatus,
    confidence: RESOLVER_CONFIDENCE,
  });
}

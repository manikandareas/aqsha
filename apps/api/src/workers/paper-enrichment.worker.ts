import {
  ArtifactService,
  classifyPaperText,
  PaperMetadataService,
  resolvePaper,
} from "@aqsha/services";
import type { Job } from "bullmq";
import { getDb } from "../clients/db";

export type PaperEnrichmentJob = {
  ownerUserId: string;
  artifactId: string;
  workspaceId: string;
  text: string;
};

const RESOLVER_CONFIDENCE = 0.95;

/**
 * Worker `paper-enrichment` (RESOLVER-ONLY, P3 — LLM fallback ditunda). classify
 * teks header → identifier → resolvePaper → upsert metadata (monotonik rank) +
 * tandai scholarly. Tanpa identifier → no-op (LLM fallback fase berikut).
 */
export async function processPaperEnrichment(job: Job<PaperEnrichmentJob>): Promise<void> {
  const { db } = getDb();
  const { ownerUserId, artifactId, workspaceId, text } = job.data;

  const classified = classifyPaperText(text);
  if (!classified) return; // tanpa identifier → resolver-only menyerah (LLM fallback nanti)

  const resolved = await resolvePaper({ classified });
  if (!resolved) return;

  const hasSignal = Boolean(
    resolved.title || resolved.abstract || (resolved.authors && resolved.authors.length > 0),
  );
  if (!hasSignal) return;

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
    sourceUrl: resolved.landingPageUrl,
    oaStatus: resolved.oaStatus,
    confidence: RESOLVER_CONFIDENCE,
  });
  await ArtifactService.markScholarly(db, ownerUserId, artifactId);
}

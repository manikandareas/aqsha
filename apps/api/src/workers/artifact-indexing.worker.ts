import { ArtifactService } from "@aqsha/services";
import type { Job } from "bullmq";
import { getDb } from "../clients/db";

export type ArtifactIndexingJob = { ownerUserId: string; artifactId: string };

/**
 * Worker `artifact-indexing` (D5): index lampiran thread BESAR yang di-offload
 * `finalizeThreadUpload` (file > INLINE_INDEX_MAX_BYTES) supaya finalize tak terblok.
 * Delegasi penuh ke `ArtifactService.runAttachmentIndexing` (idempoten; hanya artifact
 * `pending` milik owner). BullMQ retry/backoff dari `enqueue`.
 */
export async function processArtifactIndexing(job: Job<ArtifactIndexingJob>): Promise<void> {
  const { db } = getDb();
  await ArtifactService.runAttachmentIndexing(db, job.data);
}

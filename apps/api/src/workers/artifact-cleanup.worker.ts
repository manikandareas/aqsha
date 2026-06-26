import { ArtifactService } from "@aqsha/services";
import type { Job } from "bullmq";
import { getDb } from "../clients/db";

export type ArtifactCleanupJob = { ownerUserId: string; artifactId: string };

/**
 * Worker `artifact-cleanup` (FIX LEAK V1): hard-delete blob storage + embeddings + child
 * rows + parent setelah artifact di-soft-delete. Idempotent.
 */
export async function processArtifactCleanup(job: Job<ArtifactCleanupJob>): Promise<void> {
  const { db } = getDb();
  await ArtifactService.purgeArtifactStorage(db, job.data.ownerUserId, job.data.artifactId);
}

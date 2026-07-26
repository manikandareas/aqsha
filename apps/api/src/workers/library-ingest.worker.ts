import { LibraryIngestService } from "@aqsha/services";
import type { Job } from "bullmq";
import { getDb } from "../clients/db";

export type LibraryIngestJob = { ownerUserId: string; citationId: string };

/**
 * Worker `library-ingest`: post-processing satu item perpustakaan. Seluruh logika
 * ada di service; worker hanya menyediakan koneksi DB dan membiarkan BullMQ
 * mengurus retry.
 */
export async function processLibraryIngest(job: Job<LibraryIngestJob>): Promise<void> {
  const { db } = getDb();
  await LibraryIngestService.run(db, job.data);
}

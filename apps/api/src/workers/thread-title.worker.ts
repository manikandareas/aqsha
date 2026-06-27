import { TitleService } from "@aqsha/services";
import type { Job } from "bullmq";
import { getDb } from "../clients/db";

export type ThreadTitleJob = {
  threadId: string;
  titleSeed?: string;
};

/**
 * Worker `thread-title` (Slice 6.8) — generate judul thread async. Trigger:
 * `threadProjectionProcessor` agent Mastra di akhir turn pertama (enqueue + claim 'generating',
 * membawa seed pesan user pertama). Guard rename-manual di `TitleService.generate`
 * (`finalizeTitle` where status='generating').
 */
export async function processThreadTitle(job: Job<ThreadTitleJob>): Promise<void> {
  const { db } = getDb();
  await TitleService.generate(db, { threadId: job.data.threadId, titleSeed: job.data.titleSeed });
}

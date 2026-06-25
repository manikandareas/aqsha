import { TitleService } from "@aqsha/services";
import type { Job } from "bullmq";
import { getDb } from "../clients/db";

export type ThreadTitleJob = {
  threadId: string;
};

/**
 * Worker `thread-title` (Slice 6.8) — generate judul thread async. Trigger: hook eve
 * `turn.completed` turn pertama (enqueue + claim 'generating'). Guard rename-manual
 * ada di `TitleService.generate` (`finalizeTitle` where status='generating').
 */
export async function processThreadTitle(job: Job<ThreadTitleJob>): Promise<void> {
  const { db } = getDb();
  await TitleService.generate(db, job.data.threadId);
}

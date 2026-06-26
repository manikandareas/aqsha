import { ExploreAnalysesRepo } from "@aqsha/db";
import { ExploreAnalysisService, type ExploreAnalysisJob } from "@aqsha/services";
import type { Job } from "bullmq";
import { getDb } from "../clients/db";

/**
 * Worker analisis Explore (Gap + Tension). Berat: baca ~24 abstrak paper → 1 LLM call.
 * Business logic di `ExploreAnalysisService.runAnalysis`. Pada kegagalan FINAL (attempts habis)
 * patch status `error` supaya frontend berhenti polling; selama masih ada retry, biarkan
 * `pending` (frontend lanjut polling).
 */
export type { ExploreAnalysisJob };

export async function processExploreAnalysis(job: Job<ExploreAnalysisJob>): Promise<void> {
  const { db } = getDb();
  try {
    await ExploreAnalysisService.runAnalysis(db, job.data);
    console.log(`[worker:explore-analysis] selesai untuk "${job.data.query}"`);
  } catch (err) {
    const isFinal = (job.attemptsMade ?? 0) + 1 >= (job.opts.attempts ?? 1);
    if (isFinal) {
      await ExploreAnalysesRepo.patchResult(db, job.data.id, {
        status: "error",
        lastUsedAt: Date.now(),
      });
    }
    throw err;
  }
}

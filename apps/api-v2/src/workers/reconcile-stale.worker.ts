import { ThreadService } from "@aqsha/services";
import type { Job } from "bullmq";
import { getDb } from "../clients/db";

export type ReconcileStaleJob = { kind: "cycle" };

/**
 * Worker `reconcile-stale-threads` (Phase 5, fix E) — cron berkala menandai thread "zombie"
 * (`status='streaming'` yang turn-nya mati mid-stream tanpa event terminal, mis. ENOSPC / restart)
 * → append `turn.failed` sintetik + `status='failed'` supaya `isStreamActive` klien false (composer
 * unlock). Idempoten (guard event-recency di repo + `onConflictDoNothing`).
 */
export async function processReconcileStale(_job: Job<ReconcileStaleJob>): Promise<void> {
  const { db } = getDb();
  await ThreadService.reconcileStaleStreaming(db);
}

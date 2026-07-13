import type { IntegrationProvider } from "@aqsha/db";
import { IntegrationService } from "@aqsha/services";
import type { Job } from "bullmq";
import { getDb } from "../clients/db";

/**
 * Worker refresh koneksi provider referensi (Fase 5). Idempotent + non-destruktif:
 * hanya me-refresh token + profil + stempel `last_sync_at` — TIDAK menyentuh library
 * citation (penarikan data tetap preview→commit user). Dipakai "Sinkronkan sekarang"
 * (opsional, async) dan penjadwalan periodik opt-in.
 */
export type IntegrationSyncJob = {
  ownerUserId: string;
  provider: IntegrationProvider;
};

export async function processIntegrationSync(job: Job<IntegrationSyncJob>): Promise<void> {
  const { db } = getDb();
  const { ownerUserId, provider } = job.data;
  await IntegrationService.refreshConnection(db, ownerUserId, provider);
}

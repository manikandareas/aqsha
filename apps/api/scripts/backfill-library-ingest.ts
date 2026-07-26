/**
 * Antrekan ulang item perpustakaan yang belum pernah diproses. Dijalankan manual dan
 * bertahap — migrasi sengaja tidak melakukan ini supaya menjalankannya tidak berarti
 * tiba-tiba mengunduh ribuan PDF. Aman diulang: jobId per item bersifat stabil.
 * Butuh `DATABASE_URL` + `REDIS_URL`. Ukuran batch lewat `BACKFILL_BATCH`.
 * Jalankan: `bun run --filter '@aqsha/api' backfill:library-ingest`.
 */
import { CitationRepo } from "@aqsha/db";
import { LibraryIngestService } from "@aqsha/services";
import { getDb } from "../src/clients/db";

const BATCH = Number(process.env.BACKFILL_BATCH ?? 50);

async function main(): Promise<void> {
  const { db, client } = getDb();
  const pending = await CitationRepo.listByIngestStatus(db, "pending", BATCH);
  if (pending.length === 0) {
    console.log("[backfill-library-ingest] tidak ada item tertunda");
    await client.end();
    process.exit(0);
  }
  const byOwner = new Map<string, string[]>();
  for (const row of pending) {
    byOwner.set(row.ownerUserId, [...(byOwner.get(row.ownerUserId) ?? []), row.id]);
  }
  for (const [ownerUserId, citationIds] of byOwner) {
    await LibraryIngestService.enqueue({ ownerUserId, citationIds });
  }
  console.log("[backfill-library-ingest] diantrekan", {
    queued: pending.length,
    owners: byOwner.size,
  });
  await client.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("[backfill-library-ingest] gagal", err);
  process.exit(1);
});

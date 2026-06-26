/**
 * Seed feed manual (Slice 4.2) — jalankan lane refreshTrendingPapers sekali untuk mengisi
 * /app/explore dengan paper OpenAlex nyata. Butuh `DATABASE_URL` + `OPENALEX_API_KEY` +
 * `REDIS_URL`. Jalankan: `bun run --filter '@aqsha/api' seed:feed`.
 *
 * Catatan: di Slice 4.5 seeding pindah ke `POST /admin/feed/hydrate` (enqueue lane jobs).
 * Script ini menjalankan service LANGSUNG (tanpa worker), berguna untuk seed cepat + smoke E2E.
 */
import { FeedHydrationService } from "@aqsha/services";
import { getDb } from "../src/clients/db";

async function main() {
  const { db, client } = getDb();
  const result = await FeedHydrationService.refreshTrendingPapers(db);
  console.log("[seed-feed] refreshTrendingPapers", result);
  await client.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed-feed] gagal", err);
  process.exit(1);
});

/**
 * One-off cleanup duplikat news lama (Explore feed). Sebelum fix dedupeKey, story tersindikasi
 * tersimpan sbg banyak baris (guid berbeda per seed/RSS). Script ini menyatukan: per judul
 * news ter-normalisasi, simpan baris TERBARU (order_at DESC), hapus sisanya — KECUALI baris
 * yang sudah dirujuk saved/hidden (jaga FK + jangan hilangkan item yang user simpan).
 *
 * Idempotent & aman dijalankan berulang. Butuh `DATABASE_URL`.
 * Jalankan sekali: `bun run --filter '@aqsha/api-v2' dedupe:news`.
 */
import { getDb } from "../src/clients/db";

async function main() {
  const { client } = getDb();
  const deleted = await client`
    WITH ranked AS (
      SELECT id,
             row_number() OVER (
               PARTITION BY btrim(lower(regexp_replace(title, '\\s+', ' ', 'g')))
               ORDER BY order_at DESC, id DESC
             ) AS rn
      FROM feed_items
      WHERE kind = 'news'
    )
    DELETE FROM feed_items fi
    USING ranked r
    WHERE fi.id = r.id
      AND r.rn > 1
      AND fi.id NOT IN (SELECT feed_item_id FROM saved_feed_items)
      AND fi.id NOT IN (SELECT feed_item_id FROM hidden_feed_items)
    RETURNING fi.id
  `;
  console.log(`[dedupe-news] menghapus ${deleted.length} baris news duplikat`);
  await client.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("[dedupe-news] gagal", err);
  process.exit(1);
});

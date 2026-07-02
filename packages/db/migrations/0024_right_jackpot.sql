-- Feed news pindah Google News → GDELT: buang baris news lama google_news + drop provider dari enum.
-- feed_item_id di tabel interaksi ber-FK NO ACTION → wajib hapus baris anak dulu (kalau tidak,
-- DELETE feed_items yang pernah di-save/hide/interaksi → FK violation & migrasi abort).
DELETE FROM "feed_interactions" WHERE "feed_item_id" IN (SELECT "id" FROM "feed_items" WHERE "provider" = 'google_news');--> statement-breakpoint
DELETE FROM "saved_feed_items" WHERE "feed_item_id" IN (SELECT "id" FROM "feed_items" WHERE "provider" = 'google_news');--> statement-breakpoint
DELETE FROM "hidden_feed_items" WHERE "feed_item_id" IN (SELECT "id" FROM "feed_items" WHERE "provider" = 'google_news');--> statement-breakpoint
DELETE FROM "feed_items" WHERE "provider" = 'google_news';--> statement-breakpoint
ALTER TABLE "feed_items" DROP CONSTRAINT IF EXISTS "feed_items_provider_check";--> statement-breakpoint
ALTER TABLE "feed_sources" DROP CONSTRAINT IF EXISTS "feed_sources_provider_check";--> statement-breakpoint
ALTER TABLE "feed_items" ADD CONSTRAINT "feed_items_provider_check" CHECK ("feed_items"."provider" in ('openalex', 'exa_news', 'gdelt', 'google_factcheck', 'turnbackhoax'));--> statement-breakpoint
ALTER TABLE "feed_sources" ADD CONSTRAINT "feed_sources_provider_check" CHECK ("feed_sources"."provider" in ('openalex', 'exa_news', 'gdelt', 'google_factcheck', 'turnbackhoax'));

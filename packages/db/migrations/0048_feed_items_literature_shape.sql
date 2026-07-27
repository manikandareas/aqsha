DELETE FROM "feed_interactions" WHERE "feed_item_id" IN (SELECT "id" FROM "feed_items" WHERE "kind" <> 'paper' OR "paper_key" IS NULL);--> statement-breakpoint
DELETE FROM "hidden_feed_items" WHERE "feed_item_id" IN (SELECT "id" FROM "feed_items" WHERE "kind" <> 'paper' OR "paper_key" IS NULL);--> statement-breakpoint
DELETE FROM "saved_feed_items" WHERE "feed_item_id" IN (SELECT "id" FROM "feed_items" WHERE "kind" <> 'paper' OR "paper_key" IS NULL);--> statement-breakpoint
DELETE FROM "feed_items" WHERE "kind" <> 'paper' OR "paper_key" IS NULL;--> statement-breakpoint
ALTER TABLE "feed_items" DROP CONSTRAINT "feed_items_kind_check";--> statement-breakpoint
ALTER TABLE "feed_items" DROP CONSTRAINT "feed_items_provider_check";--> statement-breakpoint
ALTER TABLE "feed_items" DROP CONSTRAINT "feed_items_retraction_status_check";--> statement-breakpoint
DROP INDEX IF EXISTS "feed_items_search_gin";--> statement-breakpoint
DROP INDEX IF EXISTS "feed_items_by_paper_key";--> statement-breakpoint
ALTER TABLE "feed_items" RENAME COLUMN "summary" TO "snippet";--> statement-breakpoint
ALTER TABLE "feed_items" RENAME COLUMN "paper_key" TO "key";--> statement-breakpoint
ALTER TABLE "feed_items" ALTER COLUMN "snippet" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "feed_items" ALTER COLUMN "url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "feed_items" ALTER COLUMN "key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "feed_items" ADD COLUMN "has_pdf" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "feed_items" ADD COLUMN "publication_date" text;--> statement-breakpoint
ALTER TABLE "feed_items" ADD COLUMN "oa_status" text;--> statement-breakpoint
ALTER TABLE "feed_items" ADD COLUMN "work_type" text;--> statement-breakpoint
ALTER TABLE "feed_items" ADD COLUMN "language" text;--> statement-breakpoint
ALTER TABLE "feed_items" ADD COLUMN "is_retracted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "feed_items" SET "has_pdf" = ("pdf_url" IS NOT NULL);--> statement-breakpoint
UPDATE "feed_items" SET "is_retracted" = ("retraction_status" = 'retracted');--> statement-breakpoint
UPDATE "feed_items" SET "authors" = '{}' WHERE "authors" IS NULL;--> statement-breakpoint
UPDATE "feed_items" SET "is_open_access" = false WHERE "is_open_access" IS NULL;--> statement-breakpoint
ALTER TABLE "feed_items" ALTER COLUMN "authors" SET DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "feed_items" ALTER COLUMN "authors" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "feed_items" ALTER COLUMN "is_open_access" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "feed_items" ALTER COLUMN "is_open_access" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "feed_items" DROP COLUMN "search_tsv";--> statement-breakpoint
ALTER TABLE "feed_items" DROP COLUMN "search_text";--> statement-breakpoint
ALTER TABLE "feed_items" DROP COLUMN "tldr";--> statement-breakpoint
ALTER TABLE "feed_items" DROP COLUMN "tldr_id";--> statement-breakpoint
ALTER TABLE "feed_items" DROP COLUMN "title_id";--> statement-breakpoint
ALTER TABLE "feed_items" DROP COLUMN "resolved_url";--> statement-breakpoint
ALTER TABLE "feed_items" DROP COLUMN "image_url";--> statement-breakpoint
ALTER TABLE "feed_items" DROP COLUMN "article_text";--> statement-breakpoint
ALTER TABLE "feed_items" DROP COLUMN "enrich_attempts";--> statement-breakpoint
ALTER TABLE "feed_items" DROP COLUMN "provider";--> statement-breakpoint
ALTER TABLE "feed_items" DROP COLUMN "source_label";--> statement-breakpoint
ALTER TABLE "feed_items" DROP COLUMN "retraction_status";--> statement-breakpoint
ALTER TABLE "feed_items" DROP COLUMN "primary_claim";--> statement-breakpoint
ALTER TABLE "feed_items" DROP COLUMN "stance_supporting";--> statement-breakpoint
ALTER TABLE "feed_items" DROP COLUMN "stance_contrasting";--> statement-breakpoint
ALTER TABLE "feed_items" DROP COLUMN "sparkline";--> statement-breakpoint
ALTER TABLE "feed_items" ADD CONSTRAINT "feed_items_kind_check" CHECK ("feed_items"."kind" = 'paper');--> statement-breakpoint
CREATE INDEX "feed_items_by_key" ON "feed_items" USING btree ("key");

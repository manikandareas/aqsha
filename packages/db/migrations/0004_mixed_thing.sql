CREATE TABLE "explore_papers" (
	"key" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"snippet" text NOT NULL,
	"abstract" text,
	"url" text NOT NULL,
	"pdf_url" text,
	"doi" text,
	"arxiv_id" text,
	"openalex_id" text,
	"provider" text NOT NULL,
	"source_label" text NOT NULL,
	"authors" text[] DEFAULT '{}' NOT NULL,
	"year" integer,
	"publication_date" text,
	"venue" text,
	"cited_by_count" integer,
	"is_open_access" boolean,
	"topics" text[] DEFAULT '{}' NOT NULL,
	"score" double precision,
	"last_seen_at" bigint NOT NULL,
	CONSTRAINT "explore_papers_provider_check" CHECK ("explore_papers"."provider" in ('OpenAlex', 'arXiv', 'Exa', 'Jina', 'Crossref'))
);
--> statement-breakpoint
CREATE TABLE "feed_items" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"tldr" text,
	"tldr_id" text,
	"title_id" text,
	"url" text NOT NULL,
	"resolved_url" text,
	"image_url" text,
	"article_text" text,
	"enrich_attempts" integer,
	"provider" text NOT NULL,
	"source_label" text NOT NULL,
	"paper_key" text,
	"doi" text,
	"authors" text[],
	"year" integer,
	"venue" text,
	"pdf_url" text,
	"cited_by_count" integer,
	"is_open_access" boolean,
	"topics" text[] DEFAULT '{}' NOT NULL,
	"trend_score" double precision NOT NULL,
	"retraction_status" text,
	"primary_claim" jsonb,
	"stance_supporting" integer,
	"stance_contrasting" integer,
	"sparkline" real[],
	"published_at" bigint,
	"dedupe_key" text NOT NULL,
	"last_seen_at" bigint NOT NULL,
	"created_at" bigint NOT NULL,
	"order_at" bigint NOT NULL,
	"search_text" text,
	"search_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', coalesce(search_text, ''))) STORED,
	CONSTRAINT "feed_items_kind_check" CHECK ("feed_items"."kind" in ('paper', 'news', 'claim', 'topic', 'idea')),
	CONSTRAINT "feed_items_provider_check" CHECK ("feed_items"."provider" in ('openalex', 'exa_news', 'google_news', 'gdelt', 'google_factcheck', 'turnbackhoax')),
	CONSTRAINT "feed_items_retraction_status_check" CHECK ("feed_items"."retraction_status" is null or "feed_items"."retraction_status" in ('none', 'concern', 'retracted'))
);
--> statement-breakpoint
CREATE TABLE "feed_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"label" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"cadence_minutes" integer NOT NULL,
	"query_params_json" text,
	"last_run_at" bigint,
	"last_status" text,
	"last_failure_reason" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "feed_sources_provider_check" CHECK ("feed_sources"."provider" in ('openalex', 'exa_news', 'google_news', 'gdelt', 'google_factcheck', 'turnbackhoax')),
	CONSTRAINT "feed_sources_last_status_check" CHECK ("feed_sources"."last_status" is null or "feed_sources"."last_status" in ('ready', 'empty', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "saved_feed_items" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"feed_item_id" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hidden_feed_items" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"feed_item_id" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feed_interactions" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"feed_item_id" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "feed_interactions_kind_check" CHECK ("feed_interactions"."kind" in ('save', 'hide', 'research', 'open_evidence'))
);
--> statement-breakpoint
CREATE TABLE "domain_reliability" (
	"domain" text PRIMARY KEY NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"unreliable" boolean,
	"last_failure_reason" text,
	"last_seen_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_feed_items" ADD CONSTRAINT "saved_feed_items_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_feed_items" ADD CONSTRAINT "saved_feed_items_feed_item_id_feed_items_id_fk" FOREIGN KEY ("feed_item_id") REFERENCES "public"."feed_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hidden_feed_items" ADD CONSTRAINT "hidden_feed_items_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hidden_feed_items" ADD CONSTRAINT "hidden_feed_items_feed_item_id_feed_items_id_fk" FOREIGN KEY ("feed_item_id") REFERENCES "public"."feed_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_interactions" ADD CONSTRAINT "feed_interactions_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_interactions" ADD CONSTRAINT "feed_interactions_feed_item_id_feed_items_id_fk" FOREIGN KEY ("feed_item_id") REFERENCES "public"."feed_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "explore_papers_by_doi" ON "explore_papers" USING btree ("doi");--> statement-breakpoint
CREATE UNIQUE INDEX "feed_items_by_dedupe_key" ON "feed_items" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "feed_items_by_kind_trend" ON "feed_items" USING btree ("kind","trend_score");--> statement-breakpoint
CREATE INDEX "feed_items_by_kind_published" ON "feed_items" USING btree ("kind","published_at");--> statement-breakpoint
CREATE INDEX "feed_items_by_order" ON "feed_items" USING btree ("order_at","id");--> statement-breakpoint
CREATE INDEX "feed_items_by_paper_key" ON "feed_items" USING btree ("paper_key");--> statement-breakpoint
CREATE INDEX "feed_items_search_gin" ON "feed_items" USING gin ("search_tsv");--> statement-breakpoint
CREATE INDEX "feed_sources_by_provider" ON "feed_sources" USING btree ("provider");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_feed_items_by_owner_item" ON "saved_feed_items" USING btree ("owner_user_id","feed_item_id");--> statement-breakpoint
CREATE INDEX "saved_feed_items_by_owner_created" ON "saved_feed_items" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "hidden_feed_items_by_owner_item" ON "hidden_feed_items" USING btree ("owner_user_id","feed_item_id");--> statement-breakpoint
CREATE INDEX "hidden_feed_items_by_owner_created" ON "hidden_feed_items" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE INDEX "feed_interactions_by_owner_item_kind" ON "feed_interactions" USING btree ("owner_user_id","feed_item_id","kind");--> statement-breakpoint
CREATE INDEX "feed_interactions_by_owner_created" ON "feed_interactions" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE INDEX "domain_reliability_by_unreliable" ON "domain_reliability" USING btree ("unreliable");
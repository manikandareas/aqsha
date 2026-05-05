-- Phase 3 (memory & embeddings) migration.
-- HAND-EDITED: do not regenerate this file. Adds:
--   1. `CREATE EXTENSION IF NOT EXISTS vector` (pgvector) at the top.
--   2. HNSW indexes on `source_chunks.embedding` and
--      `research_evidence_cards.embedding` at the bottom.
-- If drizzle-kit ever wants to overwrite this file, regenerate then re-apply
-- these manual stanzas.
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "research_evidence_cards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"chat_thread_id" uuid,
	"run_id" uuid,
	"chat_source_id" uuid,
	"source_url" text NOT NULL,
	"source_title" text,
	"claim_text" text NOT NULL,
	"quote" text,
	"important_numbers" jsonb,
	"confidence" text NOT NULL,
	"tier" text NOT NULL,
	"quality_score" integer NOT NULL,
	"provider" text,
	"notes" text,
	"embedding" vector(1536) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_evidence_cards_owner_url_claim_unique" UNIQUE("owner_user_id","source_url","claim_text"),
	CONSTRAINT "research_evidence_cards_confidence_check" CHECK ("research_evidence_cards"."confidence" in ('high', 'medium', 'low')),
	CONSTRAINT "research_evidence_cards_tier_check" CHECK ("research_evidence_cards"."tier" in ('A', 'B', 'C', 'D'))
);
--> statement-breakpoint
CREATE TABLE "source_chunks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_id" uuid NOT NULL,
	"journal_id" uuid,
	"chunk_index" integer NOT NULL,
	"text" text NOT NULL,
	"citation_metadata" jsonb,
	"embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_chunks_source_id_chunk_index_unique" UNIQUE("source_id","chunk_index")
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"journal_id" uuid,
	"url_hash" text NOT NULL,
	"source_url" text,
	"title" text,
	"storage_key" text,
	"file_name" text,
	"mime_type" text,
	"checksum" text,
	"status" text NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"page_count" integer,
	"ocr_status" text,
	"extracted_text_summary" text,
	"error_message" text,
	"error_code" text,
	"deleted_at" timestamp with time zone,
	"processing_started_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"parsed_text_storage_key" text,
	"parsed_text_size_bytes" integer,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_status_check" CHECK ("sources"."status" in ('queued', 'processing', 'ready', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "research_evidence_cards" ADD CONSTRAINT "research_evidence_cards_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_evidence_cards" ADD CONSTRAINT "research_evidence_cards_chat_thread_id_chat_threads_id_fk" FOREIGN KEY ("chat_thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_evidence_cards" ADD CONSTRAINT "research_evidence_cards_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_evidence_cards" ADD CONSTRAINT "research_evidence_cards_chat_source_id_chat_sources_id_fk" FOREIGN KEY ("chat_source_id") REFERENCES "public"."chat_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_chunks" ADD CONSTRAINT "source_chunks_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_chunks" ADD CONSTRAINT "source_chunks_journal_id_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."journals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_journal_id_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."journals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "research_evidence_cards_owner_created_idx" ON "research_evidence_cards" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE INDEX "source_chunks_journal_id_idx" ON "source_chunks" USING btree ("journal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_owner_url_hash_unique_idx" ON "sources" USING btree ("owner_user_id","url_hash");--> statement-breakpoint
CREATE INDEX "sources_journal_id_idx" ON "sources" USING btree ("journal_id");--> statement-breakpoint
CREATE INDEX "sources_checksum_idx" ON "sources" USING btree ("checksum");--> statement-breakpoint
CREATE INDEX "source_chunks_embedding_hnsw_idx" ON "source_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "research_evidence_cards_embedding_hnsw_idx" ON "research_evidence_cards" USING hnsw ("embedding" vector_cosine_ops);

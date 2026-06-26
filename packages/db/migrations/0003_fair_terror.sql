CREATE TABLE "artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"workspace_id" text,
	"folder_id" text,
	"thread_id" text,
	"artifact_type" text NOT NULL,
	"artifact_family" text NOT NULL,
	"source" text NOT NULL,
	"title" text NOT NULL,
	"language" text,
	"mime_type" text,
	"file_name" text,
	"byte_size" bigint,
	"indexing_status" text DEFAULT 'not_indexed' NOT NULL,
	"indexing_failure_reason" text,
	"detected_document_kind" text,
	"storage_r2_key" text,
	"rag_entry_id" text,
	"plain_text_preview" text,
	"indexed_at" bigint,
	"status" text DEFAULT 'active' NOT NULL,
	"deleted_at" bigint,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "artifacts_artifact_type_check" CHECK ("artifacts"."artifact_type" in ('markdown', 'plain_text', 'pdf', 'docx', 'html', 'svg', 'mermaid', 'json', 'csv', 'code', 'url')),
	CONSTRAINT "artifacts_artifact_family_check" CHECK ("artifacts"."artifact_family" in ('text', 'file', 'interactive', 'visual', 'data', 'link')),
	CONSTRAINT "artifacts_source_check" CHECK ("artifacts"."source" in ('manual', 'upload', 'agent', 'url')),
	CONSTRAINT "artifacts_indexing_status_check" CHECK ("artifacts"."indexing_status" in ('not_indexed', 'pending', 'ready', 'failed')),
	CONSTRAINT "artifacts_detected_document_kind_check" CHECK ("artifacts"."detected_document_kind" is null or "artifacts"."detected_document_kind" in ('generic', 'scholarly_paper')),
	CONSTRAINT "artifacts_status_check" CHECK ("artifacts"."status" in ('active', 'deleted'))
);
--> statement-breakpoint
CREATE TABLE "artifact_contents" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"workspace_id" text,
	"thread_id" text,
	"artifact_id" text NOT NULL,
	"blocks_json" jsonb,
	"markdown" text,
	"plain_text" text,
	"context_text" text,
	"plain_text_r2_key" text,
	"blocks_json_r2_key" text,
	"markdown_r2_key" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artifact_extractions" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"artifact_id" text NOT NULL,
	"workspace_id" text,
	"extractor" text NOT NULL,
	"status" text NOT NULL,
	"failure_reason" text,
	"started_at" bigint,
	"completed_at" bigint,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "artifact_extractions_extractor_check" CHECK ("artifact_extractions"."extractor" in ('pdf_text', 'docx_text', 'url_reader')),
	CONSTRAINT "artifact_extractions_status_check" CHECK ("artifact_extractions"."status" in ('pending', 'running', 'ready', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "artifact_paper_metadata" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"artifact_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"title" text,
	"abstract" text,
	"doi" text,
	"authors" jsonb,
	"affiliations" text[],
	"journal" text,
	"publisher" text,
	"published_year" integer,
	"keywords" text[],
	"metadata_source" text NOT NULL,
	"arxiv_id" text,
	"source_url" text,
	"oa_status" text,
	"pdf_status" text,
	"confidence" real,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "artifact_paper_metadata_metadata_source_check" CHECK ("artifact_paper_metadata"."metadata_source" in ('crossref', 'openalex', 'arxiv', 'datacite', 'semantic_scholar', 'manual', 'llm')),
	CONSTRAINT "artifact_paper_metadata_pdf_status_check" CHECK ("artifact_paper_metadata"."pdf_status" is null or "artifact_paper_metadata"."pdf_status" in ('downloaded', 'no_oa_available'))
);
--> statement-breakpoint
CREATE TABLE "artifact_urls" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"artifact_id" text NOT NULL,
	"original_url" text NOT NULL,
	"normalized_url" text NOT NULL,
	"status" text NOT NULL,
	"title" text,
	"description" text,
	"site_name" text,
	"readable_text" text,
	"context_text" text,
	"readable_text_r2_key" text,
	"failure_reason" text,
	"extracted_at" bigint,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "artifact_urls_status_check" CHECK ("artifact_urls"."status" in ('pending', 'ready', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "artifact_embeddings" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"artifact_id" text NOT NULL,
	"workspace_id" text,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_folder_id_workspace_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."workspace_folders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_contents" ADD CONSTRAINT "artifact_contents_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_contents" ADD CONSTRAINT "artifact_contents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_contents" ADD CONSTRAINT "artifact_contents_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_extractions" ADD CONSTRAINT "artifact_extractions_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_extractions" ADD CONSTRAINT "artifact_extractions_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_extractions" ADD CONSTRAINT "artifact_extractions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_paper_metadata" ADD CONSTRAINT "artifact_paper_metadata_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_paper_metadata" ADD CONSTRAINT "artifact_paper_metadata_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_paper_metadata" ADD CONSTRAINT "artifact_paper_metadata_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_urls" ADD CONSTRAINT "artifact_urls_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_urls" ADD CONSTRAINT "artifact_urls_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_urls" ADD CONSTRAINT "artifact_urls_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_embeddings" ADD CONSTRAINT "artifact_embeddings_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_embeddings" ADD CONSTRAINT "artifact_embeddings_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_embeddings" ADD CONSTRAINT "artifact_embeddings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artifacts_by_owner_status_updated" ON "artifacts" USING btree ("owner_user_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "artifacts_by_owner_workspace_status_updated" ON "artifacts" USING btree ("owner_user_id","workspace_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "artifacts_by_owner_workspace_folder_status_updated" ON "artifacts" USING btree ("owner_user_id","workspace_id","folder_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "artifacts_by_owner_thread_created" ON "artifacts" USING btree ("owner_user_id","thread_id","created_at");--> statement-breakpoint
CREATE INDEX "artifacts_by_owner_thread_source_status_created" ON "artifacts" USING btree ("owner_user_id","thread_id","source","status","created_at");--> statement-breakpoint
CREATE INDEX "artifact_contents_by_owner_artifact" ON "artifact_contents" USING btree ("owner_user_id","artifact_id");--> statement-breakpoint
CREATE INDEX "artifact_extractions_by_owner_artifact_extractor" ON "artifact_extractions" USING btree ("owner_user_id","artifact_id","extractor");--> statement-breakpoint
CREATE INDEX "artifact_paper_metadata_by_owner_artifact" ON "artifact_paper_metadata" USING btree ("owner_user_id","artifact_id");--> statement-breakpoint
CREATE INDEX "artifact_paper_metadata_by_owner_workspace_updated" ON "artifact_paper_metadata" USING btree ("owner_user_id","workspace_id","updated_at");--> statement-breakpoint
CREATE INDEX "artifact_paper_metadata_by_owner_doi" ON "artifact_paper_metadata" USING btree ("owner_user_id","doi");--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_urls_by_owner_workspace_normalized_url" ON "artifact_urls" USING btree ("owner_user_id","workspace_id","normalized_url");--> statement-breakpoint
CREATE INDEX "artifact_urls_by_owner_artifact" ON "artifact_urls" USING btree ("owner_user_id","artifact_id");--> statement-breakpoint
CREATE INDEX "artifact_urls_by_owner_workspace_status_updated" ON "artifact_urls" USING btree ("owner_user_id","workspace_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "artifact_embeddings_by_owner_artifact" ON "artifact_embeddings" USING btree ("owner_user_id","artifact_id");--> statement-breakpoint
CREATE INDEX "artifact_embeddings_embedding_hnsw" ON "artifact_embeddings" USING hnsw ("embedding" vector_cosine_ops);
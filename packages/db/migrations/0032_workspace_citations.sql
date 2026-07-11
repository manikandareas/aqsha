CREATE TABLE "workspace_citations" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"artifact_id" text,
	"source" text NOT NULL,
	"provider" text,
	"external_id" text,
	"document_type" text NOT NULL,
	"title" text NOT NULL,
	"authors_json" jsonb NOT NULL,
	"published_year" integer,
	"venue" text,
	"publisher" text,
	"doi" text,
	"url" text,
	"tags" text[] NOT NULL,
	"csl_json" jsonb NOT NULL,
	"canonical_key" text NOT NULL,
	"metadata_status" text NOT NULL,
	"reviewed_at" bigint,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	CONSTRAINT "workspace_citations_source_check" CHECK ("workspace_citations"."source" in ('import', 'provider_sync', 'artifact', 'doi', 'manual')),
	CONSTRAINT "workspace_citations_provider_check" CHECK ("workspace_citations"."provider" is null or "workspace_citations"."provider" in ('mendeley', 'zotero')),
	CONSTRAINT "workspace_citations_metadata_status_check" CHECK ("workspace_citations"."metadata_status" in ('verified', 'needs_review', 'incomplete'))
);
--> statement-breakpoint
CREATE TABLE "workspace_citation_settings" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"default_style_id" text DEFAULT 'apa-7' NOT NULL,
	"bibliography_sort" text DEFAULT 'author' NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "workspace_citation_settings_default_style_id_check" CHECK ("workspace_citation_settings"."default_style_id" in ('apa-7', 'ieee', 'vancouver', 'chicago-author-date')),
	CONSTRAINT "workspace_citation_settings_bibliography_sort_check" CHECK ("workspace_citation_settings"."bibliography_sort" in ('author', 'year', 'title'))
);
--> statement-breakpoint
CREATE TABLE "citation_import_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"source_kind" text NOT NULL,
	"format" text,
	"provider" text,
	"original_filename" text,
	"total_count" integer DEFAULT 0 NOT NULL,
	"valid_count" integer DEFAULT 0 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"records_json" jsonb,
	"summary_json" jsonb,
	"committed_at" bigint,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "citation_import_batches_source_kind_check" CHECK ("citation_import_batches"."source_kind" in ('file', 'provider_sync')),
	CONSTRAINT "citation_import_batches_format_check" CHECK ("citation_import_batches"."format" is null or "citation_import_batches"."format" in ('bibtex', 'ris')),
	CONSTRAINT "citation_import_batches_status_check" CHECK ("citation_import_batches"."status" in ('pending', 'committed'))
);
--> statement-breakpoint
ALTER TABLE "workspace_citations" ADD CONSTRAINT "workspace_citations_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_citations" ADD CONSTRAINT "workspace_citations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_citations" ADD CONSTRAINT "workspace_citations_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_citation_settings" ADD CONSTRAINT "workspace_citation_settings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_citation_settings" ADD CONSTRAINT "workspace_citation_settings_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citation_import_batches" ADD CONSTRAINT "citation_import_batches_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citation_import_batches" ADD CONSTRAINT "citation_import_batches_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_citations_by_owner_workspace_updated" ON "workspace_citations" USING btree ("owner_user_id","workspace_id","updated_at");--> statement-breakpoint
CREATE INDEX "workspace_citations_by_owner_workspace_doi" ON "workspace_citations" USING btree ("owner_user_id","workspace_id","doi");--> statement-breakpoint
CREATE INDEX "workspace_citations_by_owner_workspace_canonical" ON "workspace_citations" USING btree ("owner_user_id","workspace_id","canonical_key");--> statement-breakpoint
CREATE INDEX "workspace_citations_by_owner_artifact" ON "workspace_citations" USING btree ("owner_user_id","artifact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_citations_by_owner_workspace_external" ON "workspace_citations" USING btree ("owner_user_id","workspace_id","provider","external_id") WHERE "workspace_citations"."external_id" is not null;--> statement-breakpoint
CREATE INDEX "citation_import_batches_by_owner_workspace_created" ON "citation_import_batches" USING btree ("owner_user_id","workspace_id","created_at");
CREATE TABLE "citations" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
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
	CONSTRAINT "citations_source_check" CHECK ("citations"."source" in ('import', 'provider_sync', 'artifact', 'doi', 'manual')),
	CONSTRAINT "citations_provider_check" CHECK ("citations"."provider" is null or "citations"."provider" in ('mendeley', 'zotero')),
	CONSTRAINT "citations_metadata_status_check" CHECK ("citations"."metadata_status" in ('verified', 'needs_review', 'incomplete'))
);
--> statement-breakpoint
CREATE TABLE "workspace_citation_links" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"citation_id" text NOT NULL,
	"section_id" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_citations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "workspace_citations" CASCADE;--> statement-breakpoint
ALTER TABLE "document_citation_usages" DROP CONSTRAINT IF EXISTS "document_citation_usages_citation_id_workspace_citations_id_fk";
--> statement-breakpoint
DELETE FROM "document_citation_usages";--> statement-breakpoint
ALTER TABLE "citations" ADD CONSTRAINT "citations_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citations" ADD CONSTRAINT "citations_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_citation_links" ADD CONSTRAINT "workspace_citation_links_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_citation_links" ADD CONSTRAINT "workspace_citation_links_citation_id_citations_id_fk" FOREIGN KEY ("citation_id") REFERENCES "public"."citations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_citation_links" ADD CONSTRAINT "workspace_citation_links_section_id_workspace_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."workspace_sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "citations_by_owner_updated" ON "citations" USING btree ("owner_user_id","updated_at");--> statement-breakpoint
CREATE INDEX "citations_by_owner_doi" ON "citations" USING btree ("owner_user_id","doi");--> statement-breakpoint
CREATE INDEX "citations_by_owner_canonical" ON "citations" USING btree ("owner_user_id","canonical_key");--> statement-breakpoint
CREATE INDEX "citations_by_owner_artifact" ON "citations" USING btree ("owner_user_id","artifact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "citations_by_owner_external" ON "citations" USING btree ("owner_user_id","provider","external_id") WHERE "citations"."external_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_citation_links_ws_citation" ON "workspace_citation_links" USING btree ("workspace_id","citation_id");--> statement-breakpoint
CREATE INDEX "workspace_citation_links_by_section" ON "workspace_citation_links" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "workspace_citation_links_by_citation" ON "workspace_citation_links" USING btree ("citation_id");--> statement-breakpoint
ALTER TABLE "document_citation_usages" ADD CONSTRAINT "document_citation_usages_citation_id_citations_id_fk" FOREIGN KEY ("citation_id") REFERENCES "public"."citations"("id") ON DELETE no action ON UPDATE no action;
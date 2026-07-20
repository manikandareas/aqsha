CREATE TABLE "document_edit_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"thread_id" text,
	"base_version" integer NOT NULL,
	"proposed_source" text NOT NULL,
	"summary" text NOT NULL,
	"annotation_ids" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" bigint NOT NULL,
	"decided_at" bigint,
	CONSTRAINT "document_edit_proposals_status_check" CHECK ("document_edit_proposals"."status" in ('pending', 'accepted', 'rejected', 'superseded'))
);
--> statement-breakpoint
ALTER TABLE "workspace_sections" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "latex_builds" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "section_edit_proposals" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "workspace_sections" CASCADE;--> statement-breakpoint
DROP TABLE "latex_builds" CASCADE;--> statement-breakpoint
DROP TABLE "section_edit_proposals" CASCADE;--> statement-breakpoint
ALTER TABLE "workspaces" DROP CONSTRAINT "workspaces_stage_check";--> statement-breakpoint
ALTER TABLE "artifacts" DROP CONSTRAINT "artifacts_artifact_type_check";--> statement-breakpoint
ALTER TABLE "workspace_citation_links" DROP CONSTRAINT IF EXISTS "workspace_citation_links_section_id_workspace_sections_id_fk";
--> statement-breakpoint
ALTER TABLE "document_annotations" DROP CONSTRAINT IF EXISTS "document_annotations_section_id_workspace_sections_id_fk";
--> statement-breakpoint
DROP INDEX "workspace_citation_links_by_section";--> statement-breakpoint
DROP INDEX "document_annotations_by_section_status";--> statement-breakpoint
DROP INDEX "document_annotations_by_owner_section";--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "kind_info" jsonb;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "document_artifact_id" text;--> statement-breakpoint
ALTER TABLE "document_edit_proposals" ADD CONSTRAINT "document_edit_proposals_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_edit_proposals" ADD CONSTRAINT "document_edit_proposals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_edit_proposals_pending_by_workspace" ON "document_edit_proposals" USING btree ("workspace_id") WHERE "document_edit_proposals"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "document_edit_proposals_by_owner_workspace" ON "document_edit_proposals" USING btree ("owner_user_id","workspace_id");--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_document_artifact_id_artifacts_id_fk" FOREIGN KEY ("document_artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_annotations_by_workspace_status" ON "document_annotations" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "document_annotations_by_owner_workspace" ON "document_annotations" USING btree ("owner_user_id","workspace_id");--> statement-breakpoint
ALTER TABLE "workspaces" DROP COLUMN "stage";--> statement-breakpoint
ALTER TABLE "workspace_citation_links" DROP COLUMN "section_id";--> statement-breakpoint
ALTER TABLE "document_annotations" DROP COLUMN "section_id";--> statement-breakpoint
ALTER TABLE "document_annotations" DROP COLUMN "source_file";--> statement-breakpoint
ALTER TABLE "document_annotations" DROP COLUMN "source_line";--> statement-breakpoint
ALTER TABLE "document_annotations" DROP COLUMN "source_version";--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_artifact_type_check" CHECK ("artifacts"."artifact_type" in ('markdown', 'plain_text', 'pdf', 'docx', 'image', 'spreadsheet', 'html', 'svg', 'mermaid', 'json', 'csv', 'code', 'url', 'latex', 'typst'));
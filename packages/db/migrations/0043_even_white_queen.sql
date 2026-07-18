CREATE TABLE "document_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"artifact_id" text NOT NULL,
	"version" integer NOT NULL,
	"source" text NOT NULL,
	"author" text NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "document_revisions_author_check" CHECK ("document_revisions"."author" in ('user', 'agent', 'system'))
);
--> statement-breakpoint
CREATE TABLE "latex_builds" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"section_id" text,
	"status" text NOT NULL,
	"pdf_r2_key" text,
	"synctex_r2_key" text,
	"errors" jsonb,
	"log_tail" text,
	"source_versions" jsonb NOT NULL,
	"built_at" bigint NOT NULL,
	CONSTRAINT "latex_builds_status_check" CHECK ("latex_builds"."status" in ('ok', 'error'))
);
--> statement-breakpoint
ALTER TABLE "artifacts" DROP CONSTRAINT "artifacts_artifact_type_check";--> statement-breakpoint
ALTER TABLE "citations" ADD COLUMN "bib_key" text;--> statement-breakpoint
ALTER TABLE "document_revisions" ADD CONSTRAINT "document_revisions_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_revisions" ADD CONSTRAINT "document_revisions_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latex_builds" ADD CONSTRAINT "latex_builds_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latex_builds" ADD CONSTRAINT "latex_builds_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latex_builds" ADD CONSTRAINT "latex_builds_section_id_workspace_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."workspace_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_revisions_by_artifact_version" ON "document_revisions" USING btree ("artifact_id","version");--> statement-breakpoint
CREATE INDEX "document_revisions_by_owner_artifact" ON "document_revisions" USING btree ("owner_user_id","artifact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "latex_builds_by_section" ON "latex_builds" USING btree ("section_id") WHERE "latex_builds"."section_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "latex_builds_full_by_workspace" ON "latex_builds" USING btree ("workspace_id") WHERE "latex_builds"."section_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "citations_by_owner_bib_key" ON "citations" USING btree ("owner_user_id","bib_key") WHERE "citations"."bib_key" is not null;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_artifact_type_check" CHECK ("artifacts"."artifact_type" in ('markdown', 'plain_text', 'pdf', 'docx', 'image', 'spreadsheet', 'html', 'svg', 'mermaid', 'json', 'csv', 'code', 'url', 'latex'));
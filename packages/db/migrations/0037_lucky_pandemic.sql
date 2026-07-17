CREATE TABLE "workspace_sections" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"title" text NOT NULL,
	"sort_order" integer NOT NULL,
	"status" text DEFAULT 'empty' NOT NULL,
	"role" text,
	"document_artifact_id" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "workspace_sections_status_check" CHECK ("workspace_sections"."status" in ('empty', 'draft', 'in_review', 'done')),
	CONSTRAINT "workspace_sections_role_check" CHECK ("workspace_sections"."role" is null or "workspace_sections"."role" in ('bibliography'))
);
--> statement-breakpoint
ALTER TABLE "workspace_sections" ADD CONSTRAINT "workspace_sections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_sections" ADD CONSTRAINT "workspace_sections_document_artifact_id_artifacts_id_fk" FOREIGN KEY ("document_artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_sections_by_workspace_order" ON "workspace_sections" USING btree ("workspace_id","sort_order");
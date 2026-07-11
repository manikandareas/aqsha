CREATE TABLE "analysis_sandboxes" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"sandbox_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"staged_datasets" jsonb NOT NULL,
	"created_at" bigint NOT NULL,
	"last_used_at" bigint NOT NULL,
	CONSTRAINT "analysis_sandboxes_status_check" CHECK ("analysis_sandboxes"."status" in ('active', 'deleted'))
);
--> statement-breakpoint
ALTER TABLE "artifacts" DROP CONSTRAINT "artifacts_artifact_type_check";--> statement-breakpoint
ALTER TABLE "analysis_sandboxes" ADD CONSTRAINT "analysis_sandboxes_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_sandboxes_by_thread" ON "analysis_sandboxes" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "analysis_sandboxes_by_owner_last_used" ON "analysis_sandboxes" USING btree ("owner_user_id","last_used_at");--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_artifact_type_check" CHECK ("artifacts"."artifact_type" in ('markdown', 'plain_text', 'pdf', 'docx', 'image', 'spreadsheet', 'html', 'svg', 'mermaid', 'json', 'csv', 'code', 'url'));
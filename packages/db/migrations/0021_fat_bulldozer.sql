CREATE TABLE "artifact_edit_suggestions" (
	"id" text PRIMARY KEY NOT NULL,
	"artifact_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"thread_id" text,
	"turn_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"operations" jsonb NOT NULL,
	"summary" text NOT NULL,
	"excerpt_before" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"resolved_at" bigint,
	CONSTRAINT "artifact_edit_suggestions_status_check" CHECK ("artifact_edit_suggestions"."status" in ('pending', 'accepted', 'rejected', 'stale', 'superseded'))
);
--> statement-breakpoint
ALTER TABLE "artifact_edit_suggestions" ADD CONSTRAINT "artifact_edit_suggestions_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_edit_suggestions" ADD CONSTRAINT "artifact_edit_suggestions_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artifact_edit_suggestions_by_artifact_status" ON "artifact_edit_suggestions" USING btree ("artifact_id","status");--> statement-breakpoint
CREATE INDEX "artifact_edit_suggestions_by_owner" ON "artifact_edit_suggestions" USING btree ("owner_user_id");
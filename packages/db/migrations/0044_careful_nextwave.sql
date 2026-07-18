CREATE TABLE "document_annotations" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"section_id" text NOT NULL,
	"kind" text NOT NULL,
	"page" integer NOT NULL,
	"rects" jsonb NOT NULL,
	"selected_text" text,
	"note" text,
	"source_file" text,
	"source_line" integer,
	"source_version" integer NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"thread_id" text,
	"message_id" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "document_annotations_kind_check" CHECK ("document_annotations"."kind" in ('highlight', 'pin')),
	CONSTRAINT "document_annotations_status_check" CHECK ("document_annotations"."status" in ('open', 'sent', 'resolved', 'dismissed'))
);
--> statement-breakpoint
CREATE TABLE "section_edit_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"section_id" text NOT NULL,
	"thread_id" text,
	"base_version" integer NOT NULL,
	"proposed_source" text NOT NULL,
	"summary" text NOT NULL,
	"annotation_ids" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" bigint NOT NULL,
	"decided_at" bigint,
	CONSTRAINT "section_edit_proposals_status_check" CHECK ("section_edit_proposals"."status" in ('pending', 'accepted', 'rejected', 'superseded'))
);
--> statement-breakpoint
ALTER TABLE "document_annotations" ADD CONSTRAINT "document_annotations_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_annotations" ADD CONSTRAINT "document_annotations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_annotations" ADD CONSTRAINT "document_annotations_section_id_workspace_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."workspace_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_edit_proposals" ADD CONSTRAINT "section_edit_proposals_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_edit_proposals" ADD CONSTRAINT "section_edit_proposals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_edit_proposals" ADD CONSTRAINT "section_edit_proposals_section_id_workspace_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."workspace_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_annotations_by_section_status" ON "document_annotations" USING btree ("section_id","status");--> statement-breakpoint
CREATE INDEX "document_annotations_by_owner_section" ON "document_annotations" USING btree ("owner_user_id","section_id");--> statement-breakpoint
CREATE UNIQUE INDEX "section_edit_proposals_pending_by_section" ON "section_edit_proposals" USING btree ("section_id") WHERE "section_edit_proposals"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "section_edit_proposals_by_owner_section" ON "section_edit_proposals" USING btree ("owner_user_id","section_id");
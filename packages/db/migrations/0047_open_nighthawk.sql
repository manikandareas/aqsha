ALTER TABLE "document_edit_proposals" ADD COLUMN "base_source" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "document_edit_proposals" ADD COLUMN "hunk_decisions" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "document_edit_proposals" ADD COLUMN "applied_version" integer;
ALTER TABLE "workspaces" ADD COLUMN "kind" text DEFAULT 'freeform' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "stage" text DEFAULT 'exploration' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "deadline" bigint;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "topic_note" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_kind_check" CHECK ("workspaces"."kind" in ('undergraduate_thesis', 'masters_thesis', 'dissertation', 'journal_article', 'proposal', 'paper', 'freeform'));--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_stage_check" CHECK ("workspaces"."stage" in ('exploration', 'proposal', 'research', 'writing', 'revision', 'done'));
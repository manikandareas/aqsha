CREATE TABLE "exports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"journal_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"export_type" text NOT NULL,
	"status" text NOT NULL,
	"storage_key" text,
	"warnings_snapshot" jsonb,
	"idempotency_key" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"error_code" text,
	"ready_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exports_export_type_check" CHECK ("exports"."export_type" in ('docx')),
	CONSTRAINT "exports_status_check" CHECK ("exports"."status" in ('queued', 'processing', 'ready', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "journal_proposals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"journal_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"proposal_json" jsonb NOT NULL,
	"action_type" text NOT NULL,
	"status" text NOT NULL,
	"base_updated_at" timestamp with time zone NOT NULL,
	"target_block_ids" jsonb NOT NULL,
	"applied_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"invalidated_at" timestamp with time zone,
	"error_message" text,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_proposals_action_type_check" CHECK ("journal_proposals"."action_type" in ('replace', 'insert_below')),
	CONSTRAINT "journal_proposals_status_check" CHECK ("journal_proposals"."status" in ('pending', 'applied', 'dismissed', 'invalidated', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "journal_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"journal_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"content_json" jsonb NOT NULL,
	"plain_text" text,
	"trigger" text NOT NULL,
	"snapshot_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_versions_journal_id_version_number_unique" UNIQUE("journal_id","version_number"),
	CONSTRAINT "journal_versions_trigger_check" CHECK ("journal_versions"."trigger" in ('journal_create', 'outline_apply', 'ai_proposal_apply', 'manual_save'))
);
--> statement-breakpoint
CREATE TABLE "journals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"content_json" jsonb NOT NULL,
	"outline_json" jsonb,
	"plain_text" text,
	"archived_at" timestamp with time zone,
	"last_opened_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journals_type_check" CHECK ("journals"."type" in ('general_paper', 'proposal', 'skripsi')),
	CONSTRAINT "journals_status_check" CHECK ("journals"."status" in ('active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "source_chunks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_id" uuid NOT NULL,
	"journal_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"text" text NOT NULL,
	"citation_metadata" jsonb NOT NULL,
	"embedding_status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_chunks_source_id_chunk_index_unique" UNIQUE("source_id","chunk_index"),
	CONSTRAINT "source_chunks_embedding_status_check" CHECK ("source_chunks"."embedding_status" in ('pending', 'ready', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"journal_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"checksum" text NOT NULL,
	"status" text NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"page_count" integer,
	"ocr_status" text,
	"extracted_text_summary" text,
	"error_message" text,
	"error_code" text,
	"deleted_at" timestamp with time zone,
	"processing_started_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"parsed_text_storage_key" text,
	"parsed_text_size_bytes" integer,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_status_check" CHECK ("sources"."status" in ('queued', 'processing', 'ready', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"auth_token_identifier" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"avatar_url" text,
	"plan_code" text NOT NULL,
	"onboarding_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_user_id_unique" UNIQUE("clerk_user_id"),
	CONSTRAINT "users_auth_token_identifier_unique" UNIQUE("auth_token_identifier"),
	CONSTRAINT "users_plan_code_check" CHECK ("users"."plan_code" in ('free', 'pro'))
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_members_workspace_id_user_id_unique" UNIQUE("workspace_id","user_id"),
	CONSTRAINT "workspace_members_role_check" CHECK ("workspace_members"."role" in ('owner', 'member'))
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"plan_code" text NOT NULL,
	"active_journal_count" integer DEFAULT 0 NOT NULL,
	"archived_journal_count" integer DEFAULT 0 NOT NULL,
	"ai_actions_used" integer DEFAULT 0 NOT NULL,
	"ai_actions_reserved" integer DEFAULT 0 NOT NULL,
	"exports_used" integer DEFAULT 0 NOT NULL,
	"source_uploads_used" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_plan_code_check" CHECK ("workspaces"."plan_code" in ('free', 'pro'))
);
--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_journal_id_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."journals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_proposals" ADD CONSTRAINT "journal_proposals_journal_id_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."journals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_proposals" ADD CONSTRAINT "journal_proposals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_proposals" ADD CONSTRAINT "journal_proposals_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_versions" ADD CONSTRAINT "journal_versions_journal_id_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."journals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_versions" ADD CONSTRAINT "journal_versions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_versions" ADD CONSTRAINT "journal_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journals" ADD CONSTRAINT "journals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journals" ADD CONSTRAINT "journals_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_chunks" ADD CONSTRAINT "source_chunks_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_chunks" ADD CONSTRAINT "source_chunks_journal_id_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."journals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_chunks" ADD CONSTRAINT "source_chunks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_journal_id_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."journals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exports_journal_status_idx" ON "exports" USING btree ("journal_id","status");--> statement-breakpoint
CREATE INDEX "exports_workspace_id_idx" ON "exports" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exports_journal_idempotency_unique_idx" ON "exports" USING btree ("journal_id","idempotency_key") WHERE "exports"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "journal_proposals_journal_status_idx" ON "journal_proposals" USING btree ("journal_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_proposals_journal_idempotency_unique_idx" ON "journal_proposals" USING btree ("journal_id","idempotency_key") WHERE "journal_proposals"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "journal_versions_journal_created_idx" ON "journal_versions" USING btree ("journal_id","created_at");--> statement-breakpoint
CREATE INDEX "journals_workspace_archived_idx" ON "journals" USING btree ("workspace_id","archived_at");--> statement-breakpoint
CREATE INDEX "journals_workspace_updated_idx" ON "journals" USING btree ("workspace_id","updated_at");--> statement-breakpoint
CREATE INDEX "journals_owner_user_id_idx" ON "journals" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "source_chunks_journal_id_idx" ON "source_chunks" USING btree ("journal_id");--> statement-breakpoint
CREATE INDEX "sources_journal_id_idx" ON "sources" USING btree ("journal_id");--> statement-breakpoint
CREATE INDEX "sources_workspace_checksum_idx" ON "sources" USING btree ("workspace_id","checksum");--> statement-breakpoint
CREATE INDEX "sources_checksum_idx" ON "sources" USING btree ("checksum");--> statement-breakpoint
CREATE INDEX "workspace_members_user_id_idx" ON "workspace_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "workspaces_owner_user_id_idx" ON "workspaces" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_slug_unique_idx" ON "workspaces" USING btree ("slug") WHERE "workspaces"."slug" is not null;
CREATE TABLE "chat_sources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"chat_thread_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"source_key" text NOT NULL,
	"kind" text NOT NULL,
	"title" text,
	"url" text,
	"filename" text,
	"media_type" text,
	"provider_source_id" text,
	"metadata" jsonb,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_sources_thread_source_key_unique" UNIQUE("chat_thread_id","source_key"),
	CONSTRAINT "chat_sources_kind_check" CHECK ("chat_sources"."kind" in ('url', 'document'))
);
--> statement-breakpoint
ALTER TABLE "chat_sources" ADD CONSTRAINT "chat_sources_chat_thread_id_chat_threads_id_fk" FOREIGN KEY ("chat_thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sources" ADD CONSTRAINT "chat_sources_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sources" ADD CONSTRAINT "chat_sources_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_sources_thread_last_seen_idx" ON "chat_sources" USING btree ("chat_thread_id","last_seen_at");--> statement-breakpoint
CREATE INDEX "chat_sources_workspace_thread_idx" ON "chat_sources" USING btree ("workspace_id","chat_thread_id");--> statement-breakpoint
CREATE INDEX "chat_sources_run_id_idx" ON "chat_sources" USING btree ("run_id");

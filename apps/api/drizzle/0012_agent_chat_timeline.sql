DROP TABLE IF EXISTS "agent_run_outputs" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "agent_events" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "agent_messages" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "agent_runs" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "agent_threads" CASCADE;--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"chat_thread_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"error_message" text,
	"metadata" jsonb,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_runs_status_check" CHECK ("agent_runs"."status" in ('queued', 'running', 'completed', 'failed', 'cancel_requested'))
);
--> statement-breakpoint
CREATE TABLE "agent_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"chat_thread_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"type" text NOT NULL,
	"scope" text DEFAULT 'run' NOT NULL,
	"status" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"agent_name" text,
	"tool_name" text,
	"parent_event_id" uuid,
	"payload" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_events_run_sequence_unique" UNIQUE("run_id","sequence"),
	CONSTRAINT "agent_events_status_check" CHECK ("agent_events"."status" in ('pending', 'running', 'completed', 'failed')),
	CONSTRAINT "agent_events_scope_check" CHECK ("agent_events"."scope" in ('run', 'step', 'reasoning', 'tool', 'source', 'message', 'error', 'agent', 'stream'))
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_chat_thread_id_chat_threads_id_fk" FOREIGN KEY ("chat_thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_chat_thread_id_chat_threads_id_fk" FOREIGN KEY ("chat_thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_runs_thread_created_idx" ON "agent_runs" USING btree ("chat_thread_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_active_thread_unique_idx" ON "agent_runs" USING btree ("chat_thread_id") WHERE "agent_runs"."status" in ('queued', 'running');--> statement-breakpoint
CREATE INDEX "agent_events_thread_created_idx" ON "agent_events" USING btree ("chat_thread_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_events_run_occurred_idx" ON "agent_events" USING btree ("run_id","occurred_at");--> statement-breakpoint
CREATE INDEX "agent_events_type_idx" ON "agent_events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "agent_events_scope_idx" ON "agent_events" USING btree ("scope");

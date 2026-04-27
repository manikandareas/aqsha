CREATE TABLE "agent_run_outputs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_run_outputs_kind_check" CHECK ("agent_run_outputs"."kind" in ('research_plan', 'research_batch', 'evidence_review', 'research_answer', 'final_response', 'error'))
);
--> statement-breakpoint
ALTER TABLE "agent_events" ADD COLUMN "source" text DEFAULT 'flow' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_events" ADD COLUMN "raw_type" text;--> statement-breakpoint
ALTER TABLE "agent_events" ADD COLUMN "scope" text DEFAULT 'run' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_events" ADD COLUMN "step_name" text;--> statement-breakpoint
ALTER TABLE "agent_events" ADD COLUMN "agent_role" text;--> statement-breakpoint
ALTER TABLE "agent_events" ADD COLUMN "task_name" text;--> statement-breakpoint
ALTER TABLE "agent_events" ADD COLUMN "tool_name" text;--> statement-breakpoint
ALTER TABLE "agent_events" ADD COLUMN "parent_event_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_events" ADD COLUMN "raw_payload" jsonb;--> statement-breakpoint
ALTER TABLE "agent_events" ADD COLUMN "occurred_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_run_outputs" ADD CONSTRAINT "agent_run_outputs_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_outputs" ADD CONSTRAINT "agent_run_outputs_thread_id_agent_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."agent_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_outputs" ADD CONSTRAINT "agent_run_outputs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_run_outputs_run_kind_idx" ON "agent_run_outputs" USING btree ("run_id","kind");--> statement-breakpoint
CREATE INDEX "agent_run_outputs_thread_created_idx" ON "agent_run_outputs" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_events_run_occurred_idx" ON "agent_events" USING btree ("run_id","occurred_at");--> statement-breakpoint
CREATE INDEX "agent_events_type_idx" ON "agent_events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "agent_events_scope_idx" ON "agent_events" USING btree ("scope");--> statement-breakpoint
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_source_check" CHECK ("agent_events"."source" in ('api', 'flow', 'crewai_event_bus', 'llm_hook', 'tool_hook', 'ag_ui', 'system'));--> statement-breakpoint
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_scope_check" CHECK ("agent_events"."scope" in ('run', 'flow', 'crew', 'task', 'agent', 'tool', 'mcp', 'llm', 'message', 'stream', 'error'));
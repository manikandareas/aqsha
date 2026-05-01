CREATE TABLE "agent_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"content" text NOT NULL,
	"turn_number" integer NOT NULL,
	"depth_mode" text NOT NULL,
	"run_id" uuid,
	"error_message" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_messages_session_turn_role_unique" UNIQUE("session_id","turn_number","role"),
	CONSTRAINT "agent_messages_role_check" CHECK ("agent_messages"."role" in ('user', 'assistant')),
	CONSTRAINT "agent_messages_status_check" CHECK ("agent_messages"."status" in ('pending', 'completed', 'failed')),
	CONSTRAINT "agent_messages_depth_mode_check" CHECK ("agent_messages"."depth_mode" in ('standard', 'deep'))
);
--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_session_id_agent_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_messages_session_created_idx" ON "agent_messages" USING btree ("session_id","created_at");
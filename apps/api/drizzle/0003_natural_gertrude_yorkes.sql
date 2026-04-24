CREATE TABLE "agent_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"run_id" uuid,
	"workspace_id" uuid NOT NULL,
	"phase" text,
	"sequence" integer NOT NULL,
	"event_type" text NOT NULL,
	"raw_message" jsonb,
	"curated" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_events_session_sequence_unique" UNIQUE("session_id","sequence")
);
--> statement-breakpoint
CREATE TABLE "agent_research_candidate_sources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"origin" text NOT NULL,
	"status" text DEFAULT 'candidate' NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"external_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_research_candidate_sources_origin_check" CHECK ("agent_research_candidate_sources"."origin" in ('qdrant', 'websets', 'model')),
	CONSTRAINT "agent_research_candidate_sources_status_check" CHECK ("agent_research_candidate_sources"."status" in ('candidate', 'accepted', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "agent_research_claims" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"evidence_item_id" uuid,
	"text" text NOT NULL,
	"confidence" text NOT NULL,
	"supported" boolean DEFAULT false NOT NULL,
	"citation_keys" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_research_claims_confidence_check" CHECK ("agent_research_claims"."confidence" in ('low', 'medium', 'high'))
);
--> statement-breakpoint
CREATE TABLE "agent_research_evidence_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"candidate_source_id" uuid,
	"source" text NOT NULL,
	"provenance" text NOT NULL,
	"citation_key" text NOT NULL,
	"title" text,
	"url" text,
	"quote" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_research_evidence_items_source_check" CHECK ("agent_research_evidence_items"."source" in ('qdrant', 'websets', 'manual')),
	CONSTRAINT "agent_research_evidence_items_provenance_check" CHECK ("agent_research_evidence_items"."provenance" in ('retrieved', 'model_cited', 'audited'))
);
--> statement-breakpoint
CREATE TABLE "agent_research_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"research_iterations" integer DEFAULT 0 NOT NULL,
	"max_research_iterations" integer NOT NULL,
	"plan" jsonb,
	"synthesis" jsonb,
	"audit" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_research_sessions_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"phase" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"model" text NOT NULL,
	"max_turns" integer NOT NULL,
	"max_budget_usd" text,
	"sdk_session_id" text,
	"sdk_result_subtype" text,
	"usage" jsonb,
	"model_usage" jsonb,
	"total_cost_usd" text,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_runs_phase_check" CHECK ("agent_runs"."phase" in ('planner', 'researcher', 'critic', 'synthesizer', 'citation_audit', 'synthesizer_revision', 'final')),
	CONSTRAINT "agent_runs_status_check" CHECK ("agent_runs"."status" in ('running', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "agent_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"workflow_type" text NOT NULL,
	"prompt" text NOT NULL,
	"depth_mode" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"final_answer" text,
	"audit_warnings" jsonb,
	"audit_failures" jsonb,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_sessions_workflow_type_check" CHECK ("agent_sessions"."workflow_type" in ('research')),
	CONSTRAINT "agent_sessions_depth_mode_check" CHECK ("agent_sessions"."depth_mode" in ('standard', 'deep')),
	CONSTRAINT "agent_sessions_status_check" CHECK ("agent_sessions"."status" in ('queued', 'running', 'completed', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_session_id_agent_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_research_candidate_sources" ADD CONSTRAINT "agent_research_candidate_sources_session_id_agent_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_research_candidate_sources" ADD CONSTRAINT "agent_research_candidate_sources_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_research_claims" ADD CONSTRAINT "agent_research_claims_session_id_agent_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_research_claims" ADD CONSTRAINT "agent_research_claims_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_research_claims" ADD CONSTRAINT "agent_research_claims_evidence_item_id_agent_research_evidence_items_id_fk" FOREIGN KEY ("evidence_item_id") REFERENCES "public"."agent_research_evidence_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_research_evidence_items" ADD CONSTRAINT "agent_research_evidence_items_session_id_agent_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_research_evidence_items" ADD CONSTRAINT "agent_research_evidence_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_research_evidence_items" ADD CONSTRAINT "agent_research_evidence_items_candidate_source_id_agent_research_candidate_sources_id_fk" FOREIGN KEY ("candidate_source_id") REFERENCES "public"."agent_research_candidate_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_research_sessions" ADD CONSTRAINT "agent_research_sessions_session_id_agent_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_research_sessions" ADD CONSTRAINT "agent_research_sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_session_id_agent_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_events_session_created_idx" ON "agent_events" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_events_run_id_idx" ON "agent_events" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "agent_research_candidate_sources_session_idx" ON "agent_research_candidate_sources" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "agent_research_claims_session_idx" ON "agent_research_claims" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "agent_research_claims_supported_idx" ON "agent_research_claims" USING btree ("supported");--> statement-breakpoint
CREATE INDEX "agent_research_evidence_items_session_idx" ON "agent_research_evidence_items" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "agent_research_sessions_workspace_idx" ON "agent_research_sessions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "agent_runs_session_phase_idx" ON "agent_runs" USING btree ("session_id","phase");--> statement-breakpoint
CREATE INDEX "agent_runs_workspace_started_idx" ON "agent_runs" USING btree ("workspace_id","started_at");--> statement-breakpoint
CREATE INDEX "agent_sessions_workspace_created_idx" ON "agent_sessions" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_sessions_user_id_idx" ON "agent_sessions" USING btree ("user_id");

CREATE TABLE "chat_artifacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"chat_thread_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"caption" text,
	"file_key" text NOT NULL,
	"url" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer,
	"source_ids" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_artifacts_kind_check" CHECK ("chat_artifacts"."kind" in ('visual_png'))
);
--> statement-breakpoint
ALTER TABLE "chat_artifacts" ADD CONSTRAINT "chat_artifacts_chat_thread_id_chat_threads_id_fk" FOREIGN KEY ("chat_thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_artifacts" ADD CONSTRAINT "chat_artifacts_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_artifacts_thread_created_idx" ON "chat_artifacts" USING btree ("chat_thread_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_artifacts_run_id_idx" ON "chat_artifacts" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_artifacts_file_key_unique_idx" ON "chat_artifacts" USING btree ("file_key");
CREATE TABLE "analysis_result_blocks" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"tool_call_id" text NOT NULL,
	"run_key" text NOT NULL,
	"analysis" text NOT NULL,
	"title" text NOT NULL,
	"blocks" jsonb NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analysis_result_blocks" ADD CONSTRAINT "analysis_result_blocks_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_result_blocks_by_thread_run" ON "analysis_result_blocks" USING btree ("thread_id","run_key");--> statement-breakpoint
CREATE INDEX "analysis_result_blocks_by_thread" ON "analysis_result_blocks" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "analysis_result_blocks_by_owner_created" ON "analysis_result_blocks" USING btree ("owner_user_id","created_at");
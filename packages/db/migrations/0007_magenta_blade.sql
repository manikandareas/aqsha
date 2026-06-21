CREATE TABLE "chat_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"title" text,
	"title_status" text,
	"status" text DEFAULT 'idle' NOT NULL,
	"agent_kind" text DEFAULT 'lite' NOT NULL,
	"last_message_preview" text,
	"last_activity_at" bigint NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "chat_threads_status_check" CHECK ("chat_threads"."status" in ('idle', 'streaming', 'failed')),
	CONSTRAINT "chat_threads_title_status_check" CHECK ("chat_threads"."title_status" is null or "chat_threads"."title_status" in ('generating', 'ready')),
	CONSTRAINT "chat_threads_agent_kind_check" CHECK ("chat_threads"."agent_kind" in ('lite', 'pro'))
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"role" text NOT NULL,
	"text" text NOT NULL,
	"reasoning" text,
	"status" text DEFAULT 'complete' NOT NULL,
	"turn_id" text,
	"created_at" bigint NOT NULL,
	CONSTRAINT "chat_messages_role_check" CHECK ("chat_messages"."role" in ('user', 'assistant', 'system')),
	CONSTRAINT "chat_messages_status_check" CHECK ("chat_messages"."status" in ('streaming', 'complete', 'error'))
);
--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_threads_by_owner_activity" ON "chat_threads" USING btree ("owner_user_id","last_activity_at");--> statement-breakpoint
CREATE INDEX "chat_messages_by_thread_created" ON "chat_messages" USING btree ("thread_id","created_at");
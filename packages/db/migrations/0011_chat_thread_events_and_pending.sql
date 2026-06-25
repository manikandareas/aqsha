CREATE TABLE "chat_thread_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"event_index" integer NOT NULL,
	"type" text NOT NULL,
	"turn_id" text,
	"payload" jsonb NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_threads" ADD COLUMN "pending_user_message" text;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD COLUMN "pending_user_message_created_at" bigint;--> statement-breakpoint
ALTER TABLE "chat_thread_events" ADD CONSTRAINT "chat_thread_events_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_thread_events" ADD CONSTRAINT "chat_thread_events_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_thread_events_thread_event_index" ON "chat_thread_events" USING btree ("thread_id","event_index");
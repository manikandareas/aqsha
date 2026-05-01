CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"thread_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"role" text NOT NULL,
	"ui_message" jsonb NOT NULL,
	"client_message_id" text,
	"model" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_messages_role_check" CHECK ("chat_messages"."role" in ('system', 'user', 'assistant', 'tool'))
);
--> statement-breakpoint
CREATE TABLE "chat_threads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"title" text DEFAULT 'New chat' NOT NULL,
	"model" text,
	"status" text DEFAULT 'active' NOT NULL,
	"metadata" jsonb,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_threads_status_check" CHECK ("chat_threads"."status" in ('active', 'archived'))
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_messages_thread_created_idx" ON "chat_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_messages_workspace_created_idx" ON "chat_messages" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_messages_thread_client_message_unique_idx" ON "chat_messages" USING btree ("thread_id","client_message_id") WHERE "chat_messages"."client_message_id" is not null;--> statement-breakpoint
CREATE INDEX "chat_threads_workspace_last_message_idx" ON "chat_threads" USING btree ("workspace_id","last_message_at");--> statement-breakpoint
CREATE INDEX "chat_threads_workspace_updated_idx" ON "chat_threads" USING btree ("workspace_id","updated_at");--> statement-breakpoint
CREATE INDEX "chat_threads_owner_user_id_idx" ON "chat_threads" USING btree ("owner_user_id");
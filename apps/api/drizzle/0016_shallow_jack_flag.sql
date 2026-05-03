DROP INDEX "chat_artifacts_file_key_unique_idx";--> statement-breakpoint
ALTER TABLE "chat_artifacts" ALTER COLUMN "file_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_artifacts" ALTER COLUMN "url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_artifacts" ALTER COLUMN "content_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_artifacts" ADD COLUMN "owner_user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_artifacts" ADD COLUMN "message_id" text;--> statement-breakpoint
ALTER TABLE "chat_artifacts" ADD COLUMN "checksum" text;--> statement-breakpoint
ALTER TABLE "chat_artifacts" ADD COLUMN "source_refs" jsonb;--> statement-breakpoint
ALTER TABLE "chat_artifacts" ADD COLUMN "visual_spec" jsonb;--> statement-breakpoint
ALTER TABLE "chat_artifacts" ADD COLUMN "audit_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_artifacts" ADD COLUMN "audit_summary" text;--> statement-breakpoint
ALTER TABLE "chat_artifacts" ADD COLUMN "failure_summary" text;--> statement-breakpoint
ALTER TABLE "chat_artifacts" ADD COLUMN "developer_detail" jsonb;--> statement-breakpoint
ALTER TABLE "chat_artifacts" ADD CONSTRAINT "chat_artifacts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_artifacts" ADD CONSTRAINT "chat_artifacts_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_artifacts_owner_created_idx" ON "chat_artifacts" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_artifacts_file_key_unique_idx" ON "chat_artifacts" USING btree ("file_key") WHERE "chat_artifacts"."file_key" is not null;--> statement-breakpoint
ALTER TABLE "chat_artifacts" DROP COLUMN "metadata";--> statement-breakpoint
ALTER TABLE "chat_artifacts" ADD CONSTRAINT "chat_artifacts_audit_status_check" CHECK ("chat_artifacts"."audit_status" in ('pending', 'passed', 'omitted', 'failed'));
ALTER TABLE "subscriptions" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "active_journal_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "archived_journal_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ai_actions_used" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ai_actions_reserved" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "exports_used" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "source_uploads_used" integer DEFAULT 0 NOT NULL;--> statement-breakpoint

ALTER TABLE "agent_events" DROP CONSTRAINT "agent_events_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "agent_runs" DROP CONSTRAINT "agent_runs_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "chat_messages" DROP CONSTRAINT "chat_messages_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "chat_sources" DROP CONSTRAINT "chat_sources_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "chat_threads" DROP CONSTRAINT "chat_threads_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "exports" DROP CONSTRAINT "exports_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "journal_versions" DROP CONSTRAINT "journal_versions_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "journals" DROP CONSTRAINT "journals_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_workspace_id_workspaces_id_fk";--> statement-breakpoint

ALTER TABLE "exports" DROP CONSTRAINT "exports_owner_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "journal_versions" DROP CONSTRAINT "journal_versions_created_by_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "journals" DROP CONSTRAINT "journals_owner_user_id_users_id_fk";--> statement-breakpoint

DROP INDEX "chat_messages_workspace_created_idx";--> statement-breakpoint
DROP INDEX "chat_sources_workspace_thread_idx";--> statement-breakpoint
DROP INDEX "chat_threads_workspace_last_message_idx";--> statement-breakpoint
DROP INDEX "chat_threads_workspace_updated_idx";--> statement-breakpoint
DROP INDEX "chat_threads_owner_user_id_idx";--> statement-breakpoint
DROP INDEX "exports_workspace_id_idx";--> statement-breakpoint
DROP INDEX "journals_workspace_archived_idx";--> statement-breakpoint
DROP INDEX "journals_workspace_updated_idx";--> statement-breakpoint
DROP INDEX "journals_owner_user_id_idx";--> statement-breakpoint
DROP INDEX "subscriptions_workspace_id_idx";--> statement-breakpoint
DROP INDEX "subscriptions_workspace_status_idx";--> statement-breakpoint
DROP INDEX "subscriptions_current_workspace_unique_idx";--> statement-breakpoint
DROP INDEX "user_workspace_preferences_active_workspace_id_idx";--> statement-breakpoint
DROP INDEX "workspaces_owner_user_id_idx";--> statement-breakpoint
DROP INDEX "workspaces_slug_unique_idx";--> statement-breakpoint

ALTER TABLE "agent_events" DROP COLUMN "workspace_id";--> statement-breakpoint
ALTER TABLE "agent_runs" DROP COLUMN "workspace_id";--> statement-breakpoint
ALTER TABLE "chat_messages" DROP COLUMN "workspace_id";--> statement-breakpoint
ALTER TABLE "chat_sources" DROP COLUMN "workspace_id";--> statement-breakpoint
ALTER TABLE "chat_threads" DROP COLUMN "workspace_id";--> statement-breakpoint
ALTER TABLE "exports" DROP COLUMN "workspace_id";--> statement-breakpoint
ALTER TABLE "journal_versions" DROP COLUMN "workspace_id";--> statement-breakpoint
ALTER TABLE "journals" DROP COLUMN "workspace_id";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "workspace_id";--> statement-breakpoint

ALTER TABLE "exports" ADD CONSTRAINT "exports_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_versions" ADD CONSTRAINT "journal_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journals" ADD CONSTRAINT "journals_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "chat_threads_owner_last_message_idx" ON "chat_threads" USING btree ("owner_user_id","last_message_at");--> statement-breakpoint
CREATE INDEX "chat_threads_owner_updated_idx" ON "chat_threads" USING btree ("owner_user_id","updated_at");--> statement-breakpoint
CREATE INDEX "exports_owner_user_id_idx" ON "exports" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "journals_owner_archived_idx" ON "journals" USING btree ("owner_user_id","archived_at");--> statement-breakpoint
CREATE INDEX "journals_owner_updated_idx" ON "journals" USING btree ("owner_user_id","updated_at");--> statement-breakpoint
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_user_status_idx" ON "subscriptions" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_current_user_unique_idx" ON "subscriptions" USING btree ("user_id") WHERE "subscriptions"."ended_at" is null;--> statement-breakpoint

DROP TABLE "user_workspace_preferences" CASCADE;--> statement-breakpoint
DROP TABLE "workspace_members" CASCADE;--> statement-breakpoint
DROP TABLE "workspaces" CASCADE;

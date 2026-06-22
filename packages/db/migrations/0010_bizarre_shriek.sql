ALTER TABLE "workspaces" DROP CONSTRAINT "workspaces_owner_user_id_users_owner_user_id_fk";
--> statement-breakpoint
ALTER TABLE "workspace_folders" DROP CONSTRAINT "workspace_folders_owner_user_id_users_owner_user_id_fk";
--> statement-breakpoint
ALTER TABLE "user_onboarding" DROP CONSTRAINT "user_onboarding_owner_user_id_users_owner_user_id_fk";
--> statement-breakpoint
ALTER TABLE "user_feed_interests" DROP CONSTRAINT "user_feed_interests_owner_user_id_users_owner_user_id_fk";
--> statement-breakpoint
ALTER TABLE "artifacts" DROP CONSTRAINT "artifacts_owner_user_id_users_owner_user_id_fk";
--> statement-breakpoint
ALTER TABLE "artifact_contents" DROP CONSTRAINT "artifact_contents_owner_user_id_users_owner_user_id_fk";
--> statement-breakpoint
ALTER TABLE "artifact_extractions" DROP CONSTRAINT "artifact_extractions_owner_user_id_users_owner_user_id_fk";
--> statement-breakpoint
ALTER TABLE "artifact_paper_metadata" DROP CONSTRAINT "artifact_paper_metadata_owner_user_id_users_owner_user_id_fk";
--> statement-breakpoint
ALTER TABLE "artifact_urls" DROP CONSTRAINT "artifact_urls_owner_user_id_users_owner_user_id_fk";
--> statement-breakpoint
ALTER TABLE "artifact_embeddings" DROP CONSTRAINT "artifact_embeddings_owner_user_id_users_owner_user_id_fk";
--> statement-breakpoint
ALTER TABLE "chat_threads" DROP CONSTRAINT "chat_threads_owner_user_id_users_owner_user_id_fk";
--> statement-breakpoint
ALTER TABLE "chat_messages" DROP CONSTRAINT "chat_messages_owner_user_id_users_owner_user_id_fk";
--> statement-breakpoint
ALTER TABLE "research_sources" DROP CONSTRAINT "research_sources_owner_user_id_users_owner_user_id_fk";
--> statement-breakpoint
ALTER TABLE "saved_feed_items" DROP CONSTRAINT "saved_feed_items_owner_user_id_users_owner_user_id_fk";
--> statement-breakpoint
ALTER TABLE "hidden_feed_items" DROP CONSTRAINT "hidden_feed_items_owner_user_id_users_owner_user_id_fk";
--> statement-breakpoint
ALTER TABLE "feed_interactions" DROP CONSTRAINT "feed_interactions_owner_user_id_users_owner_user_id_fk";
--> statement-breakpoint
ALTER TABLE "billing_subscriptions" DROP CONSTRAINT "billing_subscriptions_owner_user_id_users_owner_user_id_fk";
--> statement-breakpoint
ALTER TABLE "admin_entitlements" DROP CONSTRAINT "admin_entitlements_owner_user_id_users_owner_user_id_fk";
--> statement-breakpoint
ALTER TABLE "billing_credit_periods" DROP CONSTRAINT "billing_credit_periods_owner_user_id_users_owner_user_id_fk";
--> statement-breakpoint
ALTER TABLE "provider_usage_ledger" DROP CONSTRAINT "provider_usage_ledger_owner_user_id_users_owner_user_id_fk";
--> statement-breakpoint
ALTER TABLE "usage_daily_rollup" DROP CONSTRAINT "usage_daily_rollup_owner_user_id_users_owner_user_id_fk";
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deletion_status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_folders" ADD CONSTRAINT "workspace_folders_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_onboarding" ADD CONSTRAINT "user_onboarding_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_feed_interests" ADD CONSTRAINT "user_feed_interests_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_contents" ADD CONSTRAINT "artifact_contents_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_extractions" ADD CONSTRAINT "artifact_extractions_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_paper_metadata" ADD CONSTRAINT "artifact_paper_metadata_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_urls" ADD CONSTRAINT "artifact_urls_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_embeddings" ADD CONSTRAINT "artifact_embeddings_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_sources" ADD CONSTRAINT "research_sources_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_feed_items" ADD CONSTRAINT "saved_feed_items_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hidden_feed_items" ADD CONSTRAINT "hidden_feed_items_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_interactions" ADD CONSTRAINT "feed_interactions_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_entitlements" ADD CONSTRAINT "admin_entitlements_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_credit_periods" ADD CONSTRAINT "billing_credit_periods_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_usage_ledger" ADD CONSTRAINT "provider_usage_ledger_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_daily_rollup" ADD CONSTRAINT "usage_daily_rollup_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_deletion_status_check" CHECK ("users"."deletion_status" in ('active', 'deleting', 'deleted', 'failed'));
CREATE TABLE "billing_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"polar_subscription_id" text NOT NULL,
	"polar_product_id" text NOT NULL,
	"product_key" text,
	"plan_key" text NOT NULL,
	"billing_interval" text NOT NULL,
	"status" text NOT NULL,
	"current_period_start" bigint,
	"current_period_end" bigint,
	"cancel_at_period_end" boolean,
	"canceled_at" bigint,
	"raw_json" jsonb,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "billing_subscriptions_plan_check" CHECK ("billing_subscriptions"."plan_key" in ('starter', 'plus')),
	CONSTRAINT "billing_subscriptions_interval_check" CHECK ("billing_subscriptions"."billing_interval" in ('month', 'year'))
);
--> statement-breakpoint
CREATE TABLE "admin_entitlements" (
	"owner_user_id" text PRIMARY KEY NOT NULL,
	"email" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_credit_periods" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"period_key" text NOT NULL,
	"plan_key" text NOT NULL,
	"status" text NOT NULL,
	"credits_limit" bigint NOT NULL,
	"credits_used" bigint DEFAULT 0 NOT NULL,
	"estimated_cost_cents" bigint DEFAULT 0 NOT NULL,
	"spend_ceiling_cents" bigint NOT NULL,
	"started_at" bigint NOT NULL,
	"reset_at" bigint NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_usage_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"thread_id" text,
	"feature" text NOT NULL,
	"provider" text NOT NULL,
	"model" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"total_tokens" integer,
	"credits" bigint NOT NULL,
	"estimated_cost_cents" bigint NOT NULL,
	"metadata" jsonb,
	"idempotency_key" text,
	"created_at" bigint NOT NULL,
	CONSTRAINT "provider_usage_ledger_feature_check" CHECK ("provider_usage_ledger"."feature" in ('normal_chat', 'pro_chat', 'cited_answer', 'deep_research', 'external_search', 'sandbox_compute', 'citation_verify'))
);
--> statement-breakpoint
CREATE TABLE "usage_daily_rollup" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"date" text NOT NULL,
	"credits" bigint DEFAULT 0 NOT NULL,
	"estimated_cost_cents" bigint DEFAULT 0 NOT NULL,
	"event_count" integer DEFAULT 0 NOT NULL,
	"feature_counts" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_entitlements" ADD CONSTRAINT "admin_entitlements_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_credit_periods" ADD CONSTRAINT "billing_credit_periods_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_usage_ledger" ADD CONSTRAINT "provider_usage_ledger_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_daily_rollup" ADD CONSTRAINT "usage_daily_rollup_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_subscriptions_by_subscription" ON "billing_subscriptions" USING btree ("polar_subscription_id");--> statement-breakpoint
CREATE INDEX "billing_subscriptions_by_owner_updated" ON "billing_subscriptions" USING btree ("owner_user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_credit_periods_by_owner_period" ON "billing_credit_periods" USING btree ("owner_user_id","period_key");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_usage_ledger_by_idempotency_key" ON "provider_usage_ledger" USING btree ("idempotency_key") WHERE "provider_usage_ledger"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "provider_usage_ledger_by_owner_feature_created" ON "provider_usage_ledger" USING btree ("owner_user_id","feature","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_daily_rollup_by_owner_date" ON "usage_daily_rollup" USING btree ("owner_user_id","date");
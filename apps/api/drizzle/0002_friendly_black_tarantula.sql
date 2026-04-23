CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_customer_id" text,
	"provider_subscription_id" text NOT NULL,
	"provider_price_id" text,
	"plan_code" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"current_period_start_at" timestamp with time zone,
	"current_period_end_at" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"canceled_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"provider_metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_plan_code_check" CHECK ("subscriptions"."plan_code" in ('free', 'pro')),
	CONSTRAINT "subscriptions_status_check" CHECK ("subscriptions"."status" in ('trialing', 'active', 'past_due', 'canceled', 'expired'))
);
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_plan_code_check";--> statement-breakpoint
ALTER TABLE "workspaces" DROP CONSTRAINT "workspaces_plan_code_check";--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_provider_subscription_unique_idx" ON "subscriptions" USING btree ("provider","provider_subscription_id");--> statement-breakpoint
CREATE INDEX "subscriptions_workspace_id_idx" ON "subscriptions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "subscriptions_workspace_status_idx" ON "subscriptions" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_current_workspace_unique_idx" ON "subscriptions" USING btree ("workspace_id") WHERE "subscriptions"."ended_at" is null;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "plan_code";--> statement-breakpoint
ALTER TABLE "workspaces" DROP COLUMN "plan_code";
ALTER TABLE "billing_subscriptions" RENAME COLUMN "polar_subscription_id" TO "provider_subscription_id";--> statement-breakpoint
ALTER TABLE "billing_subscriptions" RENAME COLUMN "polar_product_id" TO "provider_product_id";--> statement-breakpoint
ALTER INDEX "billing_subscriptions_by_subscription" RENAME TO "billing_subscriptions_by_provider";--> statement-breakpoint
ALTER TABLE "billing_subscriptions" DROP CONSTRAINT "billing_subscriptions_plan_check";--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_plan_check" CHECK ("billing_subscriptions"."plan_key" in ('starter', 'plus', 'ultra'));--> statement-breakpoint
CREATE TABLE "billing_pending_webhooks" (
	"id" text PRIMARY KEY NOT NULL,
	"event" text NOT NULL,
	"customer_email" text,
	"product_id" text,
	"raw_json" jsonb,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "users_by_email" ON "users" USING btree ("email");

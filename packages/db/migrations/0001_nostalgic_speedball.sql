CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"name" text NOT NULL,
	"emoji" text,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"archived_at" bigint,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "workspaces_status_check" CHECK ("workspaces"."status" in ('active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "user_onboarding" (
	"owner_user_id" text PRIMARY KEY NOT NULL,
	"background" text NOT NULL,
	"interests" text[] NOT NULL,
	"heard_about_source" text NOT NULL,
	"heard_about_other" text,
	"completed_at" bigint NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_feed_interests" (
	"owner_user_id" text NOT NULL,
	"topic" text NOT NULL,
	"weight" integer NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "user_feed_interests_owner_user_id_topic_pk" PRIMARY KEY("owner_user_id","topic")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "image" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "updated_at" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_onboarding" ADD CONSTRAINT "user_onboarding_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_feed_interests" ADD CONSTRAINT "user_feed_interests_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspaces_by_owner_status_updated" ON "workspaces" USING btree ("owner_user_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "workspaces_by_owner_updated" ON "workspaces" USING btree ("owner_user_id","updated_at");
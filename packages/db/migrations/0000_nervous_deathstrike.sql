CREATE TABLE "users" (
	"owner_user_id" text PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"deletion_requested_at" bigint,
	"deletion_completed_at" bigint,
	CONSTRAINT "users_clerk_user_id_unique" UNIQUE("clerk_user_id")
);

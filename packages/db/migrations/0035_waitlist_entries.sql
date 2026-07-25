CREATE TABLE "waitlist_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"company_or_university" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"verification_token_hash" text,
	"verification_expires_at" bigint,
	"verified_at" bigint,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "waitlist_entries_email_unique" UNIQUE("email"),
	CONSTRAINT "waitlist_entries_status_check" CHECK ("waitlist_entries"."status" in ('pending', 'confirmed'))
);
--> statement-breakpoint
CREATE INDEX "waitlist_entries_by_token_hash" ON "waitlist_entries" USING btree ("verification_token_hash");
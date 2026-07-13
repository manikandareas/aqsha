CREATE TABLE "integration_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"provider" text NOT NULL,
	"credentials_encrypted" text NOT NULL,
	"token_expires_at" bigint,
	"external_profile_json" jsonb,
	"selected_folders_json" jsonb,
	"last_sync_at" bigint,
	"sync_cursor" text,
	"status" text DEFAULT 'connected' NOT NULL,
	"last_error" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "integration_connections_provider_check" CHECK ("integration_connections"."provider" in ('mendeley', 'zotero')),
	CONSTRAINT "integration_connections_status_check" CHECK ("integration_connections"."status" in ('connected', 'expired', 'error', 'revoked'))
);
--> statement-breakpoint
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "integration_connections_by_owner_provider" ON "integration_connections" USING btree ("owner_user_id","provider");
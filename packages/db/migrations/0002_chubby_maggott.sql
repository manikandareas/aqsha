CREATE TABLE "workspace_folders" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	CONSTRAINT "workspace_folders_status_check" CHECK ("workspace_folders"."status" in ('active', 'deleted'))
);
--> statement-breakpoint
ALTER TABLE "workspace_folders" ADD CONSTRAINT "workspace_folders_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_folders" ADD CONSTRAINT "workspace_folders_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_folders_by_owner_workspace_status_updated" ON "workspace_folders" USING btree ("owner_user_id","workspace_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "workspace_folders_by_owner_workspace_name" ON "workspace_folders" USING btree ("owner_user_id","workspace_id","name");
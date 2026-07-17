ALTER TABLE "citation_import_batches" DROP CONSTRAINT "citation_import_batches_workspace_id_workspaces_id_fk";
--> statement-breakpoint
DROP INDEX "citation_import_batches_by_owner_workspace_created";--> statement-breakpoint
CREATE INDEX "citation_import_batches_by_owner_created" ON "citation_import_batches" USING btree ("owner_user_id","created_at");--> statement-breakpoint
ALTER TABLE "citation_import_batches" DROP COLUMN "workspace_id";
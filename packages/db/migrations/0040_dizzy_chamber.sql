DELETE FROM "research_sources" WHERE "thread_id" IN (SELECT "id" FROM "chat_threads" WHERE "workspace_id" IS NULL);--> statement-breakpoint
DELETE FROM "chat_threads" WHERE "workspace_id" IS NULL;--> statement-breakpoint
ALTER TABLE "chat_threads" DROP CONSTRAINT "chat_threads_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "chat_threads" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
CREATE TABLE "document_citation_usages" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"document_artifact_id" text NOT NULL,
	"citation_id" text NOT NULL,
	"inline_node_id" text,
	"occurrence_order" integer NOT NULL,
	"locator_json" jsonb,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_citation_usages" ADD CONSTRAINT "document_citation_usages_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_citation_usages" ADD CONSTRAINT "document_citation_usages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_citation_usages" ADD CONSTRAINT "document_citation_usages_document_artifact_id_artifacts_id_fk" FOREIGN KEY ("document_artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_citation_usages" ADD CONSTRAINT "document_citation_usages_citation_id_workspace_citations_id_fk" FOREIGN KEY ("citation_id") REFERENCES "public"."workspace_citations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_citation_usages_by_owner_document" ON "document_citation_usages" USING btree ("owner_user_id","document_artifact_id","occurrence_order");--> statement-breakpoint
CREATE INDEX "document_citation_usages_by_owner_citation" ON "document_citation_usages" USING btree ("owner_user_id","citation_id");
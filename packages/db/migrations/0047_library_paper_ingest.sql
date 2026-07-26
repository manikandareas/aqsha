ALTER TABLE "citations"
  ADD COLUMN "ingest_status" text NOT NULL DEFAULT 'pending',
  ADD COLUMN "text_coverage" text NOT NULL DEFAULT 'none',
  ADD COLUMN "ingest_error" text,
  ADD COLUMN "ingested_at" bigint;
--> statement-breakpoint
ALTER TABLE "citations"
  ADD CONSTRAINT "citations_ingest_status_check"
  CHECK ("citations"."ingest_status" in ('pending', 'processing', 'ready', 'failed'));
--> statement-breakpoint
ALTER TABLE "citations"
  ADD CONSTRAINT "citations_text_coverage_check"
  CHECK ("citations"."text_coverage" in ('none', 'abstract', 'full_text'));
--> statement-breakpoint
CREATE INDEX "citations_by_owner_ingest_status" ON "citations" ("owner_user_id", "ingest_status");
--> statement-breakpoint
ALTER TABLE "artifacts" DROP CONSTRAINT "artifacts_source_check";
--> statement-breakpoint
ALTER TABLE "artifacts"
  ADD CONSTRAINT "artifacts_source_check"
  CHECK ("artifacts"."source" in ('manual', 'upload', 'agent', 'url', 'reference'));
--> statement-breakpoint
ALTER TABLE "artifact_paper_metadata" ALTER COLUMN "workspace_id" DROP NOT NULL;

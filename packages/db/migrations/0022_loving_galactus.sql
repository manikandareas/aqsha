ALTER TABLE "artifact_edit_suggestions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "artifact_edit_suggestions" CASCADE;--> statement-breakpoint
ALTER TABLE "provider_usage_ledger" DROP CONSTRAINT "provider_usage_ledger_feature_check";--> statement-breakpoint
ALTER TABLE "provider_usage_ledger" ADD CONSTRAINT "provider_usage_ledger_feature_check" CHECK ("provider_usage_ledger"."feature" in ('normal_chat', 'pro_chat', 'cited_answer', 'deep_research', 'external_search', 'sandbox_compute', 'citation_verify', 'doc_ai_edit'));
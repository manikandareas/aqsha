ALTER TABLE "research_sources" ADD COLUMN "cited_by_count" integer;--> statement-breakpoint
ALTER TABLE "research_sources" ADD COLUMN "topics_json" text;--> statement-breakpoint
ALTER TABLE "research_sources" ADD COLUMN "stance" text;--> statement-breakpoint
ALTER TABLE "research_sources" ADD COLUMN "study_design" text;--> statement-breakpoint
ALTER TABLE "research_sources" ADD COLUMN "outcomes_json" text;--> statement-breakpoint
ALTER TABLE "research_sources" ADD CONSTRAINT "research_sources_stance_check" CHECK ("research_sources"."stance" is null or "research_sources"."stance" in ('yes', 'possibly', 'mixed', 'no', 'not_applicable'));--> statement-breakpoint
ALTER TABLE "research_sources" ADD CONSTRAINT "research_sources_study_design_check" CHECK ("research_sources"."study_design" is null or "research_sources"."study_design" in ('meta_analysis', 'systematic_review', 'rct', 'observational', 'review', 'other'));
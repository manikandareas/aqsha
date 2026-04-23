ALTER TABLE "source_chunks" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sources" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "source_chunks" CASCADE;--> statement-breakpoint
DROP TABLE "sources" CASCADE;--> statement-breakpoint
ALTER TABLE "journals" DROP CONSTRAINT "journals_type_check";--> statement-breakpoint
ALTER TABLE "journals" ADD CONSTRAINT "journals_type_check" CHECK ("journals"."type" in ('general', 'proposal', 'thesis'));
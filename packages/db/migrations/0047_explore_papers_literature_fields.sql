ALTER TABLE "explore_papers" ADD COLUMN "oa_status" text;--> statement-breakpoint
ALTER TABLE "explore_papers" ADD COLUMN "work_type" text;--> statement-breakpoint
ALTER TABLE "explore_papers" ADD COLUMN "language" text;--> statement-breakpoint
ALTER TABLE "explore_papers" ADD COLUMN "is_retracted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "explore_papers" ALTER COLUMN "snippet" DROP NOT NULL;

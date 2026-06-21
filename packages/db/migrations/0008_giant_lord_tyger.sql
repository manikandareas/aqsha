CREATE TABLE "research_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"turn_id" text NOT NULL,
	"citation_number" integer,
	"origin" text NOT NULL,
	"provider" text,
	"title" text NOT NULL,
	"locator" text NOT NULL,
	"url" text,
	"doi" text,
	"arxiv_id" text,
	"snippet" text NOT NULL,
	"evidence_strength" text NOT NULL,
	"discovery_query" text,
	"created_at" bigint NOT NULL,
	CONSTRAINT "research_sources_origin_check" CHECK ("research_sources"."origin" in ('web', 'arxiv', 'doi')),
	CONSTRAINT "research_sources_evidence_strength_check" CHECK ("research_sources"."evidence_strength" in ('strong', 'medium', 'weak'))
);
--> statement-breakpoint
ALTER TABLE "research_sources" ADD CONSTRAINT "research_sources_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_sources" ADD CONSTRAINT "research_sources_owner_user_id_users_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("owner_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "research_sources_by_thread" ON "research_sources" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "research_sources_thread_turn_locator" ON "research_sources" USING btree ("thread_id","turn_id","locator");
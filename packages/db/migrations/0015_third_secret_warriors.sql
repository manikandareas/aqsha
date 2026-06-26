CREATE TABLE "explore_analyses" (
	"id" text PRIMARY KEY NOT NULL,
	"query" text NOT NULL,
	"query_norm" text NOT NULL,
	"query_embedding" vector(1536),
	"status" text NOT NULL,
	"papers" jsonb,
	"gap" jsonb,
	"tension" jsonb,
	"created_at" bigint NOT NULL,
	"last_used_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "explore_analyses_by_query_norm" ON "explore_analyses" USING btree ("query_norm");--> statement-breakpoint
CREATE INDEX "explore_analyses_embedding_hnsw" ON "explore_analyses" USING hnsw ("query_embedding" vector_cosine_ops);
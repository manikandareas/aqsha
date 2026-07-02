import { sql } from "drizzle-orm";
import { bigint, customType, index, integer, pgTable, text, vector } from "drizzle-orm/pg-core";
import { artifacts } from "./artifacts";
import { users } from "./users";
import { workspaces } from "./workspaces";

/** Tipe `tsvector` Postgres (drizzle pg-core tak punya bawaan) — full-text lexical chunk (D4). */
const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

/**
 * artifact_embeddings — pgvector RAG index (P3). Satu row per chunk teks artifact.
 * Dimensi 1536 = `EMBEDDING_DIMENSION` (text-embedding-3-small), DISAMAKAN dengan V1
 * supaya search P6 sebanding. HNSW cosine index untuk ANN. `rag_entry_id` di
 * `artifacts` = penanda sudah ter-index; baris di sini di-hard-delete saat artifact
 * di-remove (fix leak V1) + saat re-index.
 */
export const ARTIFACT_EMBEDDING_DIMENSION = 1536;

export const artifactEmbeddings = pgTable(
  "artifact_embeddings",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.ownerUserId, { onDelete: "cascade" }),
    artifactId: text("artifact_id")
      .notNull()
      .references(() => artifacts.id),
    workspaceId: text("workspace_id").references(() => workspaces.id),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: ARTIFACT_EMBEDDING_DIMENSION }).notNull(),
    // Lexical FTS chunk (D4 hybrid search) — di-generate dari `content`, di-index GIN.
    contentTsv: tsvector("content_tsv").generatedAlwaysAs(
      sql`to_tsvector('simple', coalesce(content, ''))`,
    ),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => [
    index("artifact_embeddings_by_owner_artifact").on(t.ownerUserId, t.artifactId),
    index("artifact_embeddings_embedding_hnsw").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
    index("artifact_embeddings_content_gin").using("gin", t.contentTsv),
  ],
);

export type ArtifactEmbedding = typeof artifactEmbeddings.$inferSelect;
export type NewArtifactEmbedding = typeof artifactEmbeddings.$inferInsert;

import { bigint, index, jsonb, pgTable, text, uniqueIndex, vector } from "drizzle-orm/pg-core";
import { ARTIFACT_EMBEDDING_DIMENSION } from "./artifactEmbeddings";

/**
 * explore_analyses — hasil + BAHAN analisis Gap/Tension per-topik (Explore page). Disimpan
 * durable supaya (a) repeat exact query instan, (b) topik BERSINGGUNGAN bisa reuse bahan via
 * vector search (`query_embedding`, HNSW cosine) lalu top-up fetch secukupnya — bukan hitung
 * ulang dari nol. Dimensi embedding = `ARTIFACT_EMBEDDING_DIMENSION` (1536, text-embedding-3-small,
 * sama dgn RAG). Bukan data per-user (analisis topik = global, shared lintas user).
 *
 * `query_embedding` NULLABLE: bila kredensial embedding tak ada, baris tetap tersimpan (pulse/gap
 * tetap jalan) tapi tak ikut semantic-reuse. `papers` = korpus mentah (judul/abstrak/sitasi) =
 * "bahan" untuk reuse. `gap` = GapResult[]; `tension` = TensionData (lihat web-v2 types.ts).
 */
export const EXPLORE_ANALYSIS_DIMENSION = ARTIFACT_EMBEDDING_DIMENSION;

export const exploreAnalyses = pgTable(
  "explore_analyses",
  {
    id: text("id").primaryKey(),
    query: text("query").notNull(),
    queryNorm: text("query_norm").notNull(),
    queryEmbedding: vector("query_embedding", { dimensions: EXPLORE_ANALYSIS_DIMENSION }),
    status: text("status").notNull(), // 'pending' | 'ready' | 'error'
    papers: jsonb("papers"),
    gap: jsonb("gap"),
    tension: jsonb("tension"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    lastUsedAt: bigint("last_used_at", { mode: "number" }).notNull(),
  },
  (t) => [
    uniqueIndex("explore_analyses_by_query_norm").on(t.queryNorm),
    index("explore_analyses_embedding_hnsw").using("hnsw", t.queryEmbedding.op("vector_cosine_ops")),
  ],
);

export type ExploreAnalysis = typeof exploreAnalyses.$inferSelect;
export type NewExploreAnalysis = typeof exploreAnalyses.$inferInsert;

import { cosineDistance, eq, isNotNull, sql } from "drizzle-orm";
import {
  type ExploreAnalysis,
  exploreAnalyses,
  type NewExploreAnalysis,
} from "../schema/exploreAnalyses";
import type { DbOrTx } from "../types";

/** Tetangga semantik analisis (untuk reuse bahan topik bersinggungan). */
export type ExploreAnalysisMatch = ExploreAnalysis & { distance: number };

/**
 * Repo explore_analyses — query Drizzle saja. `searchSimilar` = ANN HNSW cosine atas
 * `query_embedding` (skip baris tanpa embedding). `upsertPending`/`patchResult` dipakai
 * ExploreAnalysisService (job gap/tension + semantic-reuse).
 */
export const ExploreAnalysesRepo = {
  async findByQueryNorm(db: DbOrTx, queryNorm: string): Promise<ExploreAnalysis | null> {
    const rows = await db
      .select()
      .from(exploreAnalyses)
      .where(eq(exploreAnalyses.queryNorm, queryNorm))
      .limit(1);
    return rows[0] ?? null;
  },

  /**
   * Insert baris baru ATAU reset baris lama (queryNorm sama) ke `pending` + embedding baru.
   * `createdAt` IKUT di-update (reset jam freshness) — beda dgn upsertByDedupeKey feed yang
   * mempertahankan createdAt; di sini tak ada FK yang merujuk, jadi recompute = baris segar.
   */
  async upsertPending(db: DbOrTx, row: NewExploreAnalysis): Promise<ExploreAnalysis> {
    const { id: _id, ...mutable } = row;
    const rows = await db
      .insert(exploreAnalyses)
      .values(row)
      .onConflictDoUpdate({ target: exploreAnalyses.queryNorm, set: mutable })
      .returning();
    return rows[0]!;
  },

  async patchResult(
    db: DbOrTx,
    id: string,
    patch: Partial<
      Pick<NewExploreAnalysis, "status" | "papers" | "gap" | "tension" | "lastUsedAt">
    >,
  ): Promise<void> {
    await db.update(exploreAnalyses).set(patch).where(eq(exploreAnalyses.id, id));
  },

  async bumpLastUsed(db: DbOrTx, id: string, lastUsedAt: number): Promise<void> {
    await db.update(exploreAnalyses).set({ lastUsedAt }).where(eq(exploreAnalyses.id, id));
  },

  /** ANN cosine atas query_embedding (HNSW). Hanya baris ber-embedding. ORDER BY jarak ASC. */
  async searchSimilar(
    db: DbOrTx,
    args: { queryVector: number[]; limit: number },
  ): Promise<ExploreAnalysisMatch[]> {
    const distance = cosineDistance(exploreAnalyses.queryEmbedding, args.queryVector);
    const rows = await db
      .select({ row: exploreAnalyses, distance })
      .from(exploreAnalyses)
      .where(isNotNull(exploreAnalyses.queryEmbedding))
      .orderBy(sql`${distance}`)
      .limit(args.limit);
    return rows.map((r) => ({ ...r.row, distance: Number(r.distance) }));
  },
};

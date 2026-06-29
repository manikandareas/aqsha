import { eq, inArray, sql } from "drizzle-orm";
import { type ExplorePaper, type NewExplorePaper, explorePapers } from "../schema/explorePapers";
import type { DbOrTx } from "../types";

/**
 * Repo explore_papers — cache paper bersama (PK=key). Upsert replace-by-key + bump
 * `last_seen_at` (port V1 upsertPaperCache). Monotonisitas rank metadata (manual>resolver>llm)
 * adalah urusan PaperMetadataService di sisi artifact; cache explore di sini sederhana replace.
 */
export const PaperCacheRepo = {
  async upsert(db: DbOrTx, row: NewExplorePaper): Promise<ExplorePaper> {
    const { key: _key, ...mutable } = row;
    const rows = await db
      .insert(explorePapers)
      .values(row)
      .onConflictDoUpdate({ target: explorePapers.key, set: mutable })
      .returning();
    return rows[0]!;
  },

  /** Upsert banyak paper dalam satu pass (waterfall search → cache). */
  async upsertMany(db: DbOrTx, rows: NewExplorePaper[]): Promise<void> {
    for (const row of rows) {
      await PaperCacheRepo.upsert(db, row);
    }
  },

  async getByKey(db: DbOrTx, key: string): Promise<ExplorePaper | null> {
    const rows = await db.select().from(explorePapers).where(eq(explorePapers.key, key)).limit(1);
    return rows[0] ?? null;
  },

  /** Resolve banyak paper by canonical key (evidence drawer / papersByKeys). */
  async findByKeys(db: DbOrTx, keys: string[]): Promise<ExplorePaper[]> {
    if (keys.length === 0) return [];
    return db.select().from(explorePapers).where(inArray(explorePapers.key, keys));
  },

  /**
   * Provenance: apakah `url` benar-benar pdf_url paper ter-cache (guard pdf-proxy, anti-SSRF).
   * `eq` tak pernah match NULL → tak perlu isNotNull (selaras FeedRepo.pdfUrlExists).
   */
  async pdfUrlExists(db: DbOrTx, url: string): Promise<boolean> {
    const rows = await db
      .select({ one: sql`1` })
      .from(explorePapers)
      .where(eq(explorePapers.pdfUrl, url))
      .limit(1);
    return rows.length > 0;
  },
};

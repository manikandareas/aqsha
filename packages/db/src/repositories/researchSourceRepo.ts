import { asc, eq } from "drizzle-orm";
import {
  type NewResearchSource,
  type ResearchSource,
  researchSources,
} from "../schema/researchSources";
import type { DbOrTx } from "../types";

/**
 * Repo research_sources (Slice 6.4) — query Drizzle saja, tanpa business rule.
 *
 * `insertMany` IDEMPOTEN: `onConflictDoNothing` pada unique
 * (`thread_id`,`turn_id`,`locator`) supaya step tool riset yang RE-RUN saat resume
 * eve tak menggandakan baris. `listByThread` untuk panel Sources (api route).
 */
export const ResearchSourceRepo = {
  async insertMany(db: DbOrTx, rows: NewResearchSource[]): Promise<void> {
    if (rows.length === 0) return;
    await db
      .insert(researchSources)
      .values(rows)
      .onConflictDoNothing({
        target: [researchSources.threadId, researchSources.turnId, researchSources.locator],
      });
  },

  async listByThread(db: DbOrTx, threadId: string): Promise<ResearchSource[]> {
    return await db
      .select()
      .from(researchSources)
      .where(eq(researchSources.threadId, threadId))
      .orderBy(asc(researchSources.createdAt), asc(researchSources.id));
  },

  // FK `thread_id` tanpa onDelete cascade → wajib dihapus sebelum threadnya (lihat ThreadService.remove).
  async deleteByThread(db: DbOrTx, threadId: string): Promise<void> {
    await db.delete(researchSources).where(eq(researchSources.threadId, threadId));
  },
};

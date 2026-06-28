import { and, asc, eq, inArray, sql } from "drizzle-orm";
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

  /** Sumber satu run deep (turn_id = workflow runId) — untuk penomoran sitasi `[n]` (G4). */
  async listByThreadTurn(db: DbOrTx, threadId: string, turnId: string): Promise<ResearchSource[]> {
    return await db
      .select()
      .from(researchSources)
      .where(and(eq(researchSources.threadId, threadId), eq(researchSources.turnId, turnId)))
      .orderBy(asc(researchSources.createdAt), asc(researchSources.id));
  },

  /** Set citation_number batch via satu UPDATE…CASE (≤60 baris per run deep). */
  async setCitationNumbers(
    db: DbOrTx,
    updates: Array<{ id: string; citationNumber: number }>,
  ): Promise<void> {
    if (updates.length === 0) return;
    const cases = sql.join(
      updates.map((u) => sql`when ${researchSources.id} = ${u.id} then ${u.citationNumber}::int`),
      sql` `,
    );
    await db
      .update(researchSources)
      .set({ citationNumber: sql`case ${cases} end` })
      .where(
        inArray(
          researchSources.id,
          updates.map((u) => u.id),
        ),
      );
  },

  // FK `thread_id` tanpa onDelete cascade → wajib dihapus sebelum threadnya (lihat ThreadService.remove).
  async deleteByThread(db: DbOrTx, threadId: string): Promise<void> {
    await db.delete(researchSources).where(eq(researchSources.threadId, threadId));
  },
};

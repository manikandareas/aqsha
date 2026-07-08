import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  type NewResearchSource,
  type ResearchSource,
  type ResearchSourceStance,
  type ResearchSourceStudyDesign,
  researchSources,
} from "../schema/researchSources";
import type { DbOrTx } from "../types";

/**
 * Repo research_sources — query Drizzle saja, tanpa business rule.
 *
 * `insertMany` IDEMPOTEN: `onConflictDoNothing` pada unique
 * (`thread_id`,`turn_id`,`locator`) supaya step tool riset yang RE-RUN saat resume
 * durable tak menggandakan baris. `listByThread` untuk panel Sources (api route).
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

  /** Sumber satu run deep (turn_id = workflow runId) — untuk penomoran sitasi `[n]`. */
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

  /** Set image_url batch (OG image hasil enrichment step search) via satu UPDATE…CASE. */
  async setImages(db: DbOrTx, updates: Array<{ id: string; imageUrl: string }>): Promise<void> {
    if (updates.length === 0) return;
    const cases = sql.join(
      updates.map((u) => sql`when ${researchSources.id} = ${u.id} then ${u.imageUrl}::text`),
      sql` `,
    );
    await db
      .update(researchSources)
      .set({ imageUrl: sql`case ${cases} end` })
      .where(
        inArray(
          researchSources.id,
          updates.map((u) => u.id),
        ),
      );
  },

  /**
   * Set hasil klasifikasi evidence viz (stance/study_design/outcomes_json) batch via satu
   * UPDATE…CASE per kolom — pola sama `setCitationNumbers`/`setImages` (≤60 baris per run deep).
   */
  async setClassification(
    db: DbOrTx,
    updates: Array<{
      id: string;
      stance: ResearchSourceStance;
      studyDesign: ResearchSourceStudyDesign;
      outcomesJson: string | null;
    }>,
  ): Promise<void> {
    if (updates.length === 0) return;
    const caseFor = (value: (u: (typeof updates)[number]) => string | null) =>
      sql`case ${sql.join(
        updates.map((u) => sql`when ${researchSources.id} = ${u.id} then ${value(u)}::text`),
        sql` `,
      )} end`;
    await db
      .update(researchSources)
      .set({
        stance: caseFor((u) => u.stance),
        studyDesign: caseFor((u) => u.studyDesign),
        outcomesJson: caseFor((u) => u.outcomesJson),
      })
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

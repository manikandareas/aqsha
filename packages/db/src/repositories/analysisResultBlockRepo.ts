import { and, asc, eq } from "drizzle-orm";
import {
  type AnalysisResultBlockRow,
  analysisResultBlocks,
} from "../schema/analysisResultBlocks";
import type { DbOrTx } from "../types";

/**
 * Repo analysis_result_blocks — persist grup blok hasil analisis (di luar teks pesan)
 * + baca per-thread untuk FE me-join penanda `{{stats:<run_key>}}` → figur/tabel.
 */
export const AnalysisResultBlockRepo = {
  /**
   * Upsert satu grup blok. Idempoten pada `(thread_id, run_key)` — retry/re-run tool
   * (toolCallId → run_key sama) menimpa baris yang sama, bukan menggandakan.
   */
  async upsert(
    db: DbOrTx,
    row: {
      id: string;
      ownerUserId: string;
      threadId: string;
      toolCallId: string;
      runKey: string;
      analysis: string;
      title: string;
      blocks: unknown[];
      custom?: boolean;
      code?: string | null;
      now: number;
    },
  ): Promise<void> {
    await db
      .insert(analysisResultBlocks)
      .values({
        id: row.id,
        ownerUserId: row.ownerUserId,
        threadId: row.threadId,
        toolCallId: row.toolCallId,
        runKey: row.runKey,
        analysis: row.analysis,
        title: row.title,
        blocks: row.blocks,
        custom: row.custom ?? false,
        code: row.code ?? null,
        createdAt: row.now,
      })
      .onConflictDoUpdate({
        target: [analysisResultBlocks.threadId, analysisResultBlocks.runKey],
        set: {
          toolCallId: row.toolCallId,
          analysis: row.analysis,
          title: row.title,
          blocks: row.blocks,
          custom: row.custom ?? false,
          code: row.code ?? null,
          createdAt: row.now,
        },
      });
  },

  /** Semua grup blok thread (urut createdAt naik) — dibaca FE per-thread. */
  async listByThread(
    db: DbOrTx,
    scope: { threadId: string; ownerUserId: string },
  ): Promise<AnalysisResultBlockRow[]> {
    return db
      .select()
      .from(analysisResultBlocks)
      .where(
        and(
          eq(analysisResultBlocks.threadId, scope.threadId),
          eq(analysisResultBlocks.ownerUserId, scope.ownerUserId),
        ),
      )
      .orderBy(asc(analysisResultBlocks.createdAt));
  },
};

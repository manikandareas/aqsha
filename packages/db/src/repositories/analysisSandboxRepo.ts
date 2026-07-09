import { eq } from "drizzle-orm";
import {
  type AnalysisSandbox,
  analysisSandboxes,
  type StagedDataset,
} from "../schema/analysisSandboxes";
import type { DbOrTx } from "../types";

/** Repo analysis_sandboxes — query Drizzle saja (lifecycle Daytona hidup di service). */
export const AnalysisSandboxRepo = {
  async findByThread(db: DbOrTx, threadId: string): Promise<AnalysisSandbox | null> {
    const rows = await db
      .select()
      .from(analysisSandboxes)
      .where(eq(analysisSandboxes.threadId, threadId))
      .limit(1);
    return rows[0] ?? null;
  },

  /**
   * Insert baris sandbox baru. `onConflictDoNothing` pada unique `thread_id`:
   * dua tool-call paralel di thread yang sama tak saling melempar unique_violation.
   * Return `true` bila baris INI yang masuk, `false` bila thread lain menang race
   * (caller wajib membuang sandbox Daytona-nya lalu mengadopsi pemenang).
   */
  async insert(
    db: DbOrTx,
    row: { id: string; ownerUserId: string; threadId: string; sandboxId: string; now: number },
  ): Promise<boolean> {
    const inserted = await db
      .insert(analysisSandboxes)
      .values({
        id: row.id,
        ownerUserId: row.ownerUserId,
        threadId: row.threadId,
        sandboxId: row.sandboxId,
        status: "active",
        stagedDatasets: [],
        createdAt: row.now,
        lastUsedAt: row.now,
      })
      .onConflictDoNothing({ target: analysisSandboxes.threadId })
      .returning({ id: analysisSandboxes.id });
    return inserted.length > 0;
  },

  async touch(db: DbOrTx, id: string, now: number): Promise<void> {
    await db
      .update(analysisSandboxes)
      .set({ lastUsedAt: now })
      .where(eq(analysisSandboxes.id, id));
  },

  /** Sandbox lama terhapus di Daytona → tukar id + reset staged (file ikut hilang). */
  async replaceSandbox(db: DbOrTx, id: string, sandboxId: string, now: number): Promise<void> {
    await db
      .update(analysisSandboxes)
      .set({ sandboxId, stagedDatasets: [], status: "active", lastUsedAt: now })
      .where(eq(analysisSandboxes.id, id));
  },

  async setStagedDatasets(
    db: DbOrTx,
    id: string,
    stagedDatasets: StagedDataset[],
    now: number,
  ): Promise<void> {
    await db
      .update(analysisSandboxes)
      .set({ stagedDatasets, lastUsedAt: now })
      .where(eq(analysisSandboxes.id, id));
  },

  async deleteById(db: DbOrTx, id: string): Promise<void> {
    await db.delete(analysisSandboxes).where(eq(analysisSandboxes.id, id));
  },
};

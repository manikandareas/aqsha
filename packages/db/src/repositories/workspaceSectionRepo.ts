import { asc, eq } from "drizzle-orm";
import {
  type NewWorkspaceSection,
  type WorkspaceSection,
  workspaceSections,
} from "../schema/workspaceSections";
import type { DbOrTx } from "../types";

/** Repo workspace_sections — query Drizzle saja. */
export const WorkspaceSectionRepo = {
  async insertMany(db: DbOrTx, rows: NewWorkspaceSection[]): Promise<void> {
    if (rows.length === 0) return;
    await db.insert(workspaceSections).values(rows);
  },

  async listByWorkspace(db: DbOrTx, workspaceId: string): Promise<WorkspaceSection[]> {
    return db
      .select()
      .from(workspaceSections)
      .where(eq(workspaceSections.workspaceId, workspaceId))
      .orderBy(asc(workspaceSections.sortOrder), asc(workspaceSections.id));
  },

  async findById(db: DbOrTx, id: string): Promise<WorkspaceSection | null> {
    const rows = await db
      .select()
      .from(workspaceSections)
      .where(eq(workspaceSections.id, id))
      .limit(1);
    return rows[0] ?? null;
  },

  async update(
    db: DbOrTx,
    id: string,
    patch: Partial<
      Pick<WorkspaceSection, "title" | "status" | "sortOrder" | "documentArtifactId" | "updatedAt">
    >,
  ): Promise<void> {
    await db.update(workspaceSections).set(patch).where(eq(workspaceSections.id, id));
  },

  async deleteById(db: DbOrTx, id: string): Promise<void> {
    await db.delete(workspaceSections).where(eq(workspaceSections.id, id));
  },

  /**
   * Tulis ulang sort_order sesuai posisi di `orderedIds` (0..n-1). Panggil dalam
   * tx; validasi keanggotaan id terhadap workspace hidup di service.
   */
  async reorder(db: DbOrTx, workspaceId: string, orderedIds: string[], now: number): Promise<void> {
    void workspaceId;
    for (let i = 0; i < orderedIds.length; i++) {
      await db
        .update(workspaceSections)
        .set({ sortOrder: i, updatedAt: now })
        .where(eq(workspaceSections.id, orderedIds[i]!));
    }
  },
};

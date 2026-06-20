import { desc, eq } from "drizzle-orm";
import { type NewWorkspace, type Workspace, workspaces } from "../schema/workspaces";
import type { DbOrTx } from "../types";

/** Repo workspaces — query Drizzle saja. */
export const WorkspaceRepo = {
  /** Workspace terbaru milik owner (port `by_owner_updated.order("desc").first()` V1). */
  async findNewestByOwner(db: DbOrTx, ownerUserId: string): Promise<Workspace | null> {
    const rows = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.ownerUserId, ownerUserId))
      .orderBy(desc(workspaces.updatedAt))
      .limit(1);
    return rows[0] ?? null;
  },

  async insert(db: DbOrTx, row: NewWorkspace): Promise<void> {
    await db.insert(workspaces).values(row);
  },
};

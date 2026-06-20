import { and, desc, eq } from "drizzle-orm";
import {
  type NewWorkspaceFolder,
  type WorkspaceFolder,
  workspaceFolders,
} from "../schema/workspaceFolders";
import type { DbOrTx } from "../types";

/** Repo workspace_folders — query Drizzle saja. */
export const FolderRepo = {
  async findById(db: DbOrTx, id: string): Promise<WorkspaceFolder | null> {
    const rows = await db
      .select()
      .from(workspaceFolders)
      .where(eq(workspaceFolders.id, id))
      .limit(1);
    return rows[0] ?? null;
  },

  /** Folder aktif suatu workspace, DESC updatedAt, capped (port `.take(200)` V1). */
  async listActiveByWorkspace(
    db: DbOrTx,
    ownerUserId: string,
    workspaceId: string,
    limit = 200,
  ): Promise<WorkspaceFolder[]> {
    return await db
      .select()
      .from(workspaceFolders)
      .where(
        and(
          eq(workspaceFolders.ownerUserId, ownerUserId),
          eq(workspaceFolders.workspaceId, workspaceId),
          eq(workspaceFolders.status, "active"),
        ),
      )
      .orderBy(desc(workspaceFolders.updatedAt))
      .limit(limit);
  },

  /** Folder aktif dengan nama persis (dedupe per owner+workspace). */
  async findActiveByName(
    db: DbOrTx,
    ownerUserId: string,
    workspaceId: string,
    name: string,
  ): Promise<WorkspaceFolder | null> {
    const rows = await db
      .select()
      .from(workspaceFolders)
      .where(
        and(
          eq(workspaceFolders.ownerUserId, ownerUserId),
          eq(workspaceFolders.workspaceId, workspaceId),
          eq(workspaceFolders.name, name),
          eq(workspaceFolders.status, "active"),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  },

  async insert(db: DbOrTx, row: NewWorkspaceFolder): Promise<void> {
    await db.insert(workspaceFolders).values(row);
  },

  async update(db: DbOrTx, id: string, patch: Partial<NewWorkspaceFolder>): Promise<void> {
    await db.update(workspaceFolders).set(patch).where(eq(workspaceFolders.id, id));
  },
};

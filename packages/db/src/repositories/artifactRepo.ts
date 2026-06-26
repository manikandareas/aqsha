import { and, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { type Artifact, artifacts, type NewArtifact } from "../schema/artifacts";
import { type KeysetCursor, encodeKeysetCursor } from "../cursor";
import type { DbOrTx } from "../types";

/** Repo artifacts (induk) — query Drizzle saja, tanpa business rule. */
export const ArtifactRepo = {
  async findById(db: DbOrTx, id: string): Promise<Artifact | null> {
    const rows = await db.select().from(artifacts).where(eq(artifacts.id, id)).limit(1);
    return rows[0] ?? null;
  },

  /** Hitung artifact aktif owner, capped (`limit(capAt+1)`) — untuk libraryItemLimit. */
  async countActiveByOwner(db: DbOrTx, ownerUserId: string, capAt: number): Promise<number> {
    const rows = await db
      .select({ id: artifacts.id })
      .from(artifacts)
      .where(and(eq(artifacts.ownerUserId, ownerUserId), eq(artifacts.status, "active")))
      .limit(capAt + 1);
    return rows.length;
  },

  /**
   * List artifact aktif suatu workspace (opsional filter folder), keyset DESC
   * (updatedAt, id), `limit+1` probe hasMore. `folderId === null` memfilter
   * artifact tanpa folder; `undefined` = semua folder.
   */
  async listActiveByWorkspace(
    db: DbOrTx,
    args: {
      ownerUserId: string;
      workspaceId: string;
      folderId?: string | null;
      limit: number;
      cursor: KeysetCursor | null;
    },
  ): Promise<{ items: Artifact[]; nextCursor: string | null }> {
    const base = [
      eq(artifacts.ownerUserId, args.ownerUserId),
      eq(artifacts.workspaceId, args.workspaceId),
      eq(artifacts.status, "active"),
    ];
    if (args.folderId === null) base.push(isNull(artifacts.folderId));
    else if (args.folderId !== undefined) base.push(eq(artifacts.folderId, args.folderId));
    const keyset = args.cursor
      ? or(
          lt(artifacts.updatedAt, args.cursor.u),
          and(eq(artifacts.updatedAt, args.cursor.u), lt(artifacts.id, args.cursor.i)),
        )
      : undefined;
    const rows = await db
      .select()
      .from(artifacts)
      .where(keyset ? and(...base, keyset) : and(...base))
      .orderBy(desc(artifacts.updatedAt), desc(artifacts.id))
      .limit(args.limit + 1);
    const hasMore = rows.length > args.limit;
    const items = hasMore ? rows.slice(0, args.limit) : rows;
    const last = items[items.length - 1];
    const nextCursor =
      hasMore && last ? encodeKeysetCursor({ u: last.updatedAt, i: last.id }) : null;
    return { items, nextCursor };
  },

  /** Top-N artifact aktif workspace, DESC updatedAt — untuk context picker (cap 50). */
  async listActiveForContextPicker(
    db: DbOrTx,
    ownerUserId: string,
    workspaceId: string,
    limit = 50,
  ): Promise<Artifact[]> {
    return await db
      .select()
      .from(artifacts)
      .where(
        and(
          eq(artifacts.ownerUserId, ownerUserId),
          eq(artifacts.workspaceId, workspaceId),
          eq(artifacts.status, "active"),
        ),
      )
      .orderBy(desc(artifacts.updatedAt))
      .limit(limit);
  },

  /**
   * Artifact aktif yang terlampir ke sebuah thread (chat-attachment/agent, headless
   * `workspace_id` boleh null). Index `by_owner_thread_created` sudah ada. DESC terbaru.
   */
  async listByThread(
    db: DbOrTx,
    ownerUserId: string,
    threadId: string,
    limit = 50,
  ): Promise<Artifact[]> {
    return await db
      .select()
      .from(artifacts)
      .where(
        and(
          eq(artifacts.ownerUserId, ownerUserId),
          eq(artifacts.threadId, threadId),
          eq(artifacts.status, "active"),
        ),
      )
      .orderBy(desc(artifacts.createdAt))
      .limit(limit);
  },

  /** ID artifact aktif dalam sebuah folder (untuk fan-out move/orphan). */
  async listActiveIdsByFolder(
    db: DbOrTx,
    ownerUserId: string,
    folderId: string,
  ): Promise<string[]> {
    const rows = await db
      .select({ id: artifacts.id })
      .from(artifacts)
      .where(
        and(
          eq(artifacts.ownerUserId, ownerUserId),
          eq(artifacts.folderId, folderId),
          eq(artifacts.status, "active"),
        ),
      );
    return rows.map((r) => r.id);
  },

  /** Bulk re-point workspace artifact aktif dalam folder (folder ikut pindah). */
  async setWorkspaceForFolder(
    db: DbOrTx,
    ownerUserId: string,
    folderId: string,
    targetWorkspaceId: string,
    now: number,
  ): Promise<void> {
    await db
      .update(artifacts)
      .set({ workspaceId: targetWorkspaceId, updatedAt: now })
      .where(
        and(
          eq(artifacts.ownerUserId, ownerUserId),
          eq(artifacts.folderId, folderId),
          eq(artifacts.status, "active"),
        ),
      );
  },

  /** Bulk orphan (clear folder_id) artifact aktif dalam folder yang dihapus. */
  async clearFolderForFolder(
    db: DbOrTx,
    ownerUserId: string,
    folderId: string,
    now: number,
  ): Promise<void> {
    await db
      .update(artifacts)
      .set({ folderId: null, updatedAt: now })
      .where(
        and(
          eq(artifacts.ownerUserId, ownerUserId),
          eq(artifacts.folderId, folderId),
          eq(artifacts.status, "active"),
        ),
      );
  },

  async insert(db: DbOrTx, row: NewArtifact): Promise<void> {
    await db.insert(artifacts).values(row);
  },

  async update(db: DbOrTx, id: string, patch: Partial<NewArtifact>): Promise<void> {
    await db.update(artifacts).set(patch).where(eq(artifacts.id, id));
  },

  /** Hard-delete parent (dipakai worker artifact-cleanup setelah child rows). */
  async deleteById(db: DbOrTx, id: string): Promise<void> {
    await db.delete(artifacts).where(eq(artifacts.id, id));
  },

  /** Hard-delete banyak parent by id (cascade owner-deletion / cleanup). */
  async deleteByIds(db: DbOrTx, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await db.delete(artifacts).where(inArray(artifacts.id, ids));
  },
};

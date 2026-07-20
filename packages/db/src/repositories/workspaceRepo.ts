import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import { type KeysetCursor, encodeKeysetCursor } from "../cursor";
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

  async findById(db: DbOrTx, id: string): Promise<Workspace | null> {
    const rows = await db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1);
    return rows[0] ?? null;
  },

  /**
   * List keyset milik owner, DESC `(updatedAt, id)`. `includeArchived=false` →
   * index `by_owner_status_updated` (active-only); `true` → `by_owner_updated`.
   * Mengembalikan `limit` item + `nextCursor` (null bila halaman terakhir).
   */
  async listByOwner(
    db: DbOrTx,
    args: {
      ownerUserId: string;
      includeArchived: boolean;
      limit: number;
      cursor: KeysetCursor | null;
    },
  ): Promise<{ items: Workspace[]; nextCursor: string | null }> {
    const ownerFilter = args.includeArchived
      ? eq(workspaces.ownerUserId, args.ownerUserId)
      : and(eq(workspaces.ownerUserId, args.ownerUserId), eq(workspaces.status, "active"));
    const keyset = args.cursor
      ? or(
          lt(workspaces.updatedAt, args.cursor.u),
          and(eq(workspaces.updatedAt, args.cursor.u), lt(workspaces.id, args.cursor.i)),
        )
      : undefined;

    const rows = await db
      .select()
      .from(workspaces)
      .where(keyset ? and(ownerFilter, keyset) : ownerFilter)
      .orderBy(desc(workspaces.updatedAt), desc(workspaces.id))
      .limit(args.limit + 1);

    const hasMore = rows.length > args.limit;
    const items = hasMore ? rows.slice(0, args.limit) : rows;
    const last = items[items.length - 1];
    const nextCursor =
      hasMore && last ? encodeKeysetCursor({ u: last.updatedAt, i: last.id }) : null;
    return { items, nextCursor };
  },

  /** Hitung workspace aktif milik owner, di-cap di `capAt` (untuk capacity check murah). */
  async countActiveByOwner(db: DbOrTx, ownerUserId: string, capAt: number): Promise<number> {
    const rows = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(and(eq(workspaces.ownerUserId, ownerUserId), eq(workspaces.status, "active")))
      .limit(capAt + 1);
    return rows.length;
  },

  async insert(db: DbOrTx, row: NewWorkspace): Promise<void> {
    await db.insert(workspaces).values(row);
  },

  async update(db: DbOrTx, id: string, patch: Partial<NewWorkspace>): Promise<void> {
    await db.update(workspaces).set(patch).where(eq(workspaces.id, id));
  },

  /** Klaim pointer dokumen proyek HANYA bila masih kosong — guard race lazy-create dua penulis. */
  async setDocumentArtifactIfNull(
    db: DbOrTx,
    id: string,
    artifactId: string,
    now: number,
  ): Promise<boolean> {
    const rows = await db
      .update(workspaces)
      .set({ documentArtifactId: artifactId, updatedAt: now })
      .where(and(eq(workspaces.id, id), isNull(workspaces.documentArtifactId)))
      .returning({ id: workspaces.id });
    return rows.length > 0;
  },
};

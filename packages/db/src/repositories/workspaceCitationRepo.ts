import { and, arrayContains, desc, eq, ilike, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { encodeKeysetCursor, type KeysetCursor } from "../cursor";
import {
  type CitationMetadataStatus,
  type CitationProvider,
  type CitationSource,
  type NewWorkspaceCitation,
  type WorkspaceCitation,
  workspaceCitations,
} from "../schema/workspaceCitations";
import type { DbOrTx } from "../types";

export type WorkspaceCitationListFilters = {
  q?: string;
  status?: CitationMetadataStatus;
  source?: CitationSource;
  tag?: string;
};

/** Repo workspace_citations — query Drizzle saja; aturan bisnis di @aqsha/services. */
export const WorkspaceCitationRepo = {
  async listByWorkspace(
    db: DbOrTx,
    args: {
      ownerUserId: string;
      workspaceId: string;
      limit: number;
      cursor: KeysetCursor | null;
      filters?: WorkspaceCitationListFilters;
    },
  ): Promise<{ items: WorkspaceCitation[]; nextCursor: string | null }> {
    const base = [
      eq(workspaceCitations.ownerUserId, args.ownerUserId),
      eq(workspaceCitations.workspaceId, args.workspaceId),
      isNull(workspaceCitations.deletedAt),
    ];
    const f = args.filters;
    if (f?.status) base.push(eq(workspaceCitations.metadataStatus, f.status));
    if (f?.source) base.push(eq(workspaceCitations.source, f.source));
    if (f?.tag) base.push(arrayContains(workspaceCitations.tags, [f.tag]));
    if (f?.q) {
      const escaped = f.q.replace(/[\\%_]/g, (m) => `\\${m}`);
      const pattern = `%${escaped}%`;
      const match = or(
        ilike(workspaceCitations.title, pattern),
        ilike(workspaceCitations.venue, pattern),
        ilike(workspaceCitations.doi, pattern),
        sql`${workspaceCitations.authorsJson}::text ilike ${pattern}`,
      );
      if (match) base.push(match);
    }
    const keyset = args.cursor
      ? or(
          lt(workspaceCitations.updatedAt, args.cursor.u),
          and(
            eq(workspaceCitations.updatedAt, args.cursor.u),
            lt(workspaceCitations.id, args.cursor.i),
          ),
        )
      : undefined;
    const rows = await db
      .select()
      .from(workspaceCitations)
      .where(keyset ? and(...base, keyset) : and(...base))
      .orderBy(desc(workspaceCitations.updatedAt), desc(workspaceCitations.id))
      .limit(args.limit + 1);
    const hasMore = rows.length > args.limit;
    const items = hasMore ? rows.slice(0, args.limit) : rows;
    const last = items[items.length - 1];
    const nextCursor =
      hasMore && last ? encodeKeysetCursor({ u: last.updatedAt, i: last.id }) : null;
    return { items, nextCursor };
  },

  async countActive(db: DbOrTx, ownerUserId: string, workspaceId: string): Promise<number> {
    const rows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(workspaceCitations)
      .where(
        and(
          eq(workspaceCitations.ownerUserId, ownerUserId),
          eq(workspaceCitations.workspaceId, workspaceId),
          isNull(workspaceCitations.deletedAt),
        ),
      );
    return rows[0]?.count ?? 0;
  },

  async findById(
    db: DbOrTx,
    ownerUserId: string,
    id: string,
  ): Promise<WorkspaceCitation | null> {
    const rows = await db
      .select()
      .from(workspaceCitations)
      .where(and(eq(workspaceCitations.ownerUserId, ownerUserId), eq(workspaceCitations.id, id)))
      .limit(1);
    return rows[0] ?? null;
  },

  async findByIds(db: DbOrTx, ownerUserId: string, ids: string[]): Promise<WorkspaceCitation[]> {
    if (ids.length === 0) return [];
    return db
      .select()
      .from(workspaceCitations)
      .where(
        and(eq(workspaceCitations.ownerUserId, ownerUserId), inArray(workspaceCitations.id, ids)),
      );
  },

  /** Semua citation aktif satu workspace (untuk export/dedupe) — tanpa pagination. */
  async listAllActive(
    db: DbOrTx,
    ownerUserId: string,
    workspaceId: string,
  ): Promise<WorkspaceCitation[]> {
    return db
      .select()
      .from(workspaceCitations)
      .where(
        and(
          eq(workspaceCitations.ownerUserId, ownerUserId),
          eq(workspaceCitations.workspaceId, workspaceId),
          isNull(workspaceCitations.deletedAt),
        ),
      )
      .orderBy(desc(workspaceCitations.updatedAt), desc(workspaceCitations.id));
  },

  /** Kandidat duplikat: cocokkan `canonical_key` pada citation aktif workspace. */
  async findActiveByCanonicalKeys(
    db: DbOrTx,
    ownerUserId: string,
    workspaceId: string,
    canonicalKeys: string[],
  ): Promise<WorkspaceCitation[]> {
    if (canonicalKeys.length === 0) return [];
    return db
      .select()
      .from(workspaceCitations)
      .where(
        and(
          eq(workspaceCitations.ownerUserId, ownerUserId),
          eq(workspaceCitations.workspaceId, workspaceId),
          isNull(workspaceCitations.deletedAt),
          inArray(workspaceCitations.canonicalKey, canonicalKeys),
        ),
      );
  },

  /** Idempotensi provider sync: cocokkan `(provider, external_id)` pada citation aktif. */
  async findActiveByExternalIds(
    db: DbOrTx,
    ownerUserId: string,
    workspaceId: string,
    provider: CitationProvider,
    externalIds: string[],
  ): Promise<WorkspaceCitation[]> {
    if (externalIds.length === 0) return [];
    return db
      .select()
      .from(workspaceCitations)
      .where(
        and(
          eq(workspaceCitations.ownerUserId, ownerUserId),
          eq(workspaceCitations.workspaceId, workspaceId),
          eq(workspaceCitations.provider, provider),
          isNull(workspaceCitations.deletedAt),
          inArray(workspaceCitations.externalId, externalIds),
        ),
      );
  },

  async findActiveByArtifact(
    db: DbOrTx,
    ownerUserId: string,
    workspaceId: string,
    artifactId: string,
  ): Promise<WorkspaceCitation | null> {
    const rows = await db
      .select()
      .from(workspaceCitations)
      .where(
        and(
          eq(workspaceCitations.ownerUserId, ownerUserId),
          eq(workspaceCitations.workspaceId, workspaceId),
          eq(workspaceCitations.artifactId, artifactId),
          isNull(workspaceCitations.deletedAt),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  },

  async insert(db: DbOrTx, row: NewWorkspaceCitation): Promise<void> {
    await db.insert(workspaceCitations).values(row);
  },

  async insertMany(db: DbOrTx, rows: NewWorkspaceCitation[]): Promise<void> {
    if (rows.length === 0) return;
    await db.insert(workspaceCitations).values(rows);
  },

  async updateById(
    db: DbOrTx,
    id: string,
    patch: Partial<NewWorkspaceCitation>,
  ): Promise<void> {
    await db.update(workspaceCitations).set(patch).where(eq(workspaceCitations.id, id));
  },

  /** Soft delete banyak citation aktif milik owner+workspace; return jumlah terpengaruh. */
  async softDeleteMany(
    db: DbOrTx,
    ownerUserId: string,
    workspaceId: string,
    ids: string[],
    now: number,
  ): Promise<number> {
    if (ids.length === 0) return 0;
    const rows = await db
      .update(workspaceCitations)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(workspaceCitations.ownerUserId, ownerUserId),
          eq(workspaceCitations.workspaceId, workspaceId),
          inArray(workspaceCitations.id, ids),
          isNull(workspaceCitations.deletedAt),
        ),
      )
      .returning({ id: workspaceCitations.id });
    return rows.length;
  },

  /** Tag distinct citation aktif workspace (untuk filter chips). */
  async listActiveTags(
    db: DbOrTx,
    ownerUserId: string,
    workspaceId: string,
  ): Promise<string[]> {
    const rows = await db
      .select({ tag: sql<string>`distinct unnest(${workspaceCitations.tags})` })
      .from(workspaceCitations)
      .where(
        and(
          eq(workspaceCitations.ownerUserId, ownerUserId),
          eq(workspaceCitations.workspaceId, workspaceId),
          isNull(workspaceCitations.deletedAt),
        ),
      );
    return rows.map((r) => r.tag).sort();
  },
};

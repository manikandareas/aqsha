import {
  and,
  arrayContains,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { encodeKeysetCursor, type KeysetCursor } from "../cursor";
import {
  type Citation,
  type CitationIngestStatus,
  type CitationMetadataStatus,
  type CitationProvider,
  type CitationSource,
  citations,
  type NewCitation,
} from "../schema/citations";
import { workspaceCitationLinks } from "../schema/workspaceCitationLinks";
import type { DbOrTx } from "../types";

export type CitationListFilters = {
  q?: string;
  status?: CitationMetadataStatus;
  source?: CitationSource;
  tag?: string;
};

function citationPredicates(ownerUserId: string, filters?: CitationListFilters): SQL[] {
  const base: SQL[] = [eq(citations.ownerUserId, ownerUserId), isNull(citations.deletedAt)];
  const f = filters;
  if (f?.status) base.push(eq(citations.metadataStatus, f.status));
  if (f?.source) base.push(eq(citations.source, f.source));
  if (f?.tag) base.push(arrayContains(citations.tags, [f.tag]));
  if (f?.q) {
    const escaped = f.q.replace(/[\\%_]/g, (m) => `\\${m}`);
    const pattern = `%${escaped}%`;
    const match = or(
      ilike(citations.title, pattern),
      ilike(citations.venue, pattern),
      ilike(citations.doi, pattern),
      sql`${citations.authorsJson}::text ilike ${pattern}`,
    );
    if (match) base.push(match);
  }
  return base;
}

/** Repo citations (perpustakaan akun) — query Drizzle saja; aturan bisnis di @aqsha/services. */
export const CitationRepo = {
  async listByOwner(
    db: DbOrTx,
    args: {
      ownerUserId: string;
      limit: number;
      cursor: KeysetCursor | null;
      filters?: CitationListFilters;
    },
  ): Promise<{ items: Citation[]; nextCursor: string | null }> {
    const base = citationPredicates(args.ownerUserId, args.filters);
    const keyset = args.cursor
      ? or(
          lt(citations.updatedAt, args.cursor.u),
          and(eq(citations.updatedAt, args.cursor.u), lt(citations.id, args.cursor.i)),
        )
      : undefined;
    const rows = await db
      .select()
      .from(citations)
      .where(keyset ? and(...base, keyset) : and(...base))
      .orderBy(desc(citations.updatedAt), desc(citations.id))
      .limit(args.limit + 1);
    const hasMore = rows.length > args.limit;
    const items = hasMore ? rows.slice(0, args.limit) : rows;
    const last = items[items.length - 1];
    const nextCursor =
      hasMore && last ? encodeKeysetCursor({ u: last.updatedAt, i: last.id }) : null;
    return { items, nextCursor };
  },

  async listByWorkspace(
    db: DbOrTx,
    args: {
      ownerUserId: string;
      workspaceId: string;
      limit: number;
      cursor: KeysetCursor | null;
      filters?: CitationListFilters;
    },
  ): Promise<{ items: Citation[]; nextCursor: string | null }> {
    const base = [
      ...citationPredicates(args.ownerUserId, args.filters),
      eq(workspaceCitationLinks.workspaceId, args.workspaceId),
    ];
    const keyset = args.cursor
      ? or(
          lt(citations.updatedAt, args.cursor.u),
          and(eq(citations.updatedAt, args.cursor.u), lt(citations.id, args.cursor.i)),
        )
      : undefined;
    const rows = await db
      .select({ citation: citations })
      .from(citations)
      .innerJoin(
        workspaceCitationLinks,
        eq(workspaceCitationLinks.citationId, citations.id),
      )
      .where(keyset ? and(...base, keyset) : and(...base))
      .orderBy(desc(citations.updatedAt), desc(citations.id))
      .limit(args.limit + 1);
    const hasMore = rows.length > args.limit;
    const page = hasMore ? rows.slice(0, args.limit) : rows;
    const items = page.map((r) => r.citation);
    const last = items[items.length - 1];
    const nextCursor =
      hasMore && last ? encodeKeysetCursor({ u: last.updatedAt, i: last.id }) : null;
    return { items, nextCursor };
  },

  async countActive(db: DbOrTx, ownerUserId: string): Promise<number> {
    const rows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(citations)
      .where(and(eq(citations.ownerUserId, ownerUserId), isNull(citations.deletedAt)));
    return rows[0]?.count ?? 0;
  },

  async countActiveByWorkspace(
    db: DbOrTx,
    ownerUserId: string,
    workspaceId: string,
  ): Promise<number> {
    const rows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(citations)
      .innerJoin(
        workspaceCitationLinks,
        eq(workspaceCitationLinks.citationId, citations.id),
      )
      .where(
        and(
          eq(citations.ownerUserId, ownerUserId),
          isNull(citations.deletedAt),
          eq(workspaceCitationLinks.workspaceId, workspaceId),
        ),
      );
    return rows[0]?.count ?? 0;
  },

  async findById(db: DbOrTx, ownerUserId: string, id: string): Promise<Citation | null> {
    const rows = await db
      .select()
      .from(citations)
      .where(and(eq(citations.ownerUserId, ownerUserId), eq(citations.id, id)))
      .limit(1);
    return rows[0] ?? null;
  },

  async findByIds(db: DbOrTx, ownerUserId: string, ids: string[]): Promise<Citation[]> {
    if (ids.length === 0) return [];
    return db
      .select()
      .from(citations)
      .where(and(eq(citations.ownerUserId, ownerUserId), inArray(citations.id, ids)));
  },

  /** Semua citation aktif satu owner (untuk export/dedupe) — tanpa pagination. */
  async listAllActive(db: DbOrTx, ownerUserId: string): Promise<Citation[]> {
    return db
      .select()
      .from(citations)
      .where(and(eq(citations.ownerUserId, ownerUserId), isNull(citations.deletedAt)))
      .orderBy(desc(citations.updatedAt), desc(citations.id));
  },

  async listAllActiveByWorkspace(
    db: DbOrTx,
    ownerUserId: string,
    workspaceId: string,
  ): Promise<Citation[]> {
    const rows = await db
      .select({ citation: citations })
      .from(citations)
      .innerJoin(
        workspaceCitationLinks,
        eq(workspaceCitationLinks.citationId, citations.id),
      )
      .where(
        and(
          eq(citations.ownerUserId, ownerUserId),
          isNull(citations.deletedAt),
          eq(workspaceCitationLinks.workspaceId, workspaceId),
        ),
      )
      .orderBy(desc(citations.updatedAt), desc(citations.id));
    return rows.map((r) => r.citation);
  },

  /**
   * Semua bib_key terpakai owner — TERMASUK citation soft-deleted: kunci direservasi
   * selamanya supaya \cite{} lama di sumber tak pernah menunjuk entri berbeda.
   */
  async listTakenBibKeys(db: DbOrTx, ownerUserId: string): Promise<string[]> {
    const rows = await db
      .select({ bibKey: citations.bibKey })
      .from(citations)
      .where(and(eq(citations.ownerUserId, ownerUserId), isNotNull(citations.bibKey)));
    return rows.flatMap((r) => (r.bibKey ? [r.bibKey] : []));
  },

  async findByBibKeys(db: DbOrTx, ownerUserId: string, keys: string[]): Promise<Citation[]> {
    if (keys.length === 0) return [];
    return db
      .select()
      .from(citations)
      .where(and(eq(citations.ownerUserId, ownerUserId), inArray(citations.bibKey, keys)));
  },

  /** Kandidat duplikat: cocokkan `canonical_key` pada citation aktif owner. */
  async findActiveByCanonicalKeys(
    db: DbOrTx,
    ownerUserId: string,
    canonicalKeys: string[],
  ): Promise<Citation[]> {
    if (canonicalKeys.length === 0) return [];
    return db
      .select()
      .from(citations)
      .where(
        and(
          eq(citations.ownerUserId, ownerUserId),
          isNull(citations.deletedAt),
          inArray(citations.canonicalKey, canonicalKeys),
        ),
      );
  },

  /** Idempotensi provider sync: cocokkan `(provider, external_id)` pada citation aktif. */
  async findActiveByExternalIds(
    db: DbOrTx,
    ownerUserId: string,
    provider: CitationProvider,
    externalIds: string[],
  ): Promise<Citation[]> {
    if (externalIds.length === 0) return [];
    return db
      .select()
      .from(citations)
      .where(
        and(
          eq(citations.ownerUserId, ownerUserId),
          eq(citations.provider, provider),
          isNull(citations.deletedAt),
          inArray(citations.externalId, externalIds),
        ),
      );
  },

  async findActiveByArtifact(
    db: DbOrTx,
    ownerUserId: string,
    artifactId: string,
  ): Promise<Citation | null> {
    const rows = await db
      .select()
      .from(citations)
      .where(
        and(
          eq(citations.ownerUserId, ownerUserId),
          eq(citations.artifactId, artifactId),
          isNull(citations.deletedAt),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  },

  async insert(db: DbOrTx, row: NewCitation): Promise<void> {
    await db.insert(citations).values(row);
  },

  async insertMany(db: DbOrTx, rows: NewCitation[]): Promise<void> {
    if (rows.length === 0) return;
    await db.insert(citations).values(rows);
  },

  async updateById(db: DbOrTx, id: string, patch: Partial<NewCitation>): Promise<void> {
    await db.update(citations).set(patch).where(eq(citations.id, id));
  },

  /** Soft delete banyak citation aktif milik owner; return jumlah terpengaruh. */
  async softDeleteMany(
    db: DbOrTx,
    ownerUserId: string,
    ids: string[],
    now: number,
  ): Promise<number> {
    if (ids.length === 0) return 0;
    const rows = await db
      .update(citations)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(citations.ownerUserId, ownerUserId),
          inArray(citations.id, ids),
          isNull(citations.deletedAt),
        ),
      )
      .returning({ id: citations.id });
    return rows.length;
  },

  /** Tag distinct citation aktif owner (untuk filter chips). */
  async listActiveTags(db: DbOrTx, ownerUserId: string): Promise<string[]> {
    const rows = await db
      .select({ tag: sql<string>`distinct unnest(${citations.tags})` })
      .from(citations)
      .where(and(eq(citations.ownerUserId, ownerUserId), isNull(citations.deletedAt)));
    return rows.map((r) => r.tag).sort();
  },

  async listActiveTagsByWorkspace(
    db: DbOrTx,
    ownerUserId: string,
    workspaceId: string,
  ): Promise<string[]> {
    const rows = await db
      .select({ tag: sql<string>`distinct unnest(${citations.tags})` })
      .from(citations)
      .innerJoin(
        workspaceCitationLinks,
        eq(workspaceCitationLinks.citationId, citations.id),
      )
      .where(
        and(
          eq(citations.ownerUserId, ownerUserId),
          isNull(citations.deletedAt),
          eq(workspaceCitationLinks.workspaceId, workspaceId),
        ),
      );
    return rows.map((r) => r.tag).sort();
  },

  /**
   * Item yang belum pernah diproses, untuk backfill bertahap. Sengaja LINTAS OWNER —
   * ini perkakas operasional yang dijalankan dari shell, bukan jalur permintaan
   * pengguna, jadi tidak ada scope owner yang bisa disimpulkan.
   */
  async listByIngestStatus(
    db: DbOrTx,
    ingestStatus: CitationIngestStatus,
    limit: number,
  ): Promise<Array<{ id: string; ownerUserId: string }>> {
    return db
      .select({ id: citations.id, ownerUserId: citations.ownerUserId })
      .from(citations)
      .where(and(eq(citations.ingestStatus, ingestStatus), isNull(citations.deletedAt)))
      .limit(limit);
  },
};

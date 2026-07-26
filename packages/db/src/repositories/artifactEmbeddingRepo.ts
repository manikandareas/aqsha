import { and, cosineDistance, desc, eq, inArray, type SQL, sql } from "drizzle-orm";
import { artifacts } from "../schema/artifacts";
import {
  artifactEmbeddings,
  type NewArtifactEmbedding,
} from "../schema/artifactEmbeddings";
import { citations } from "../schema/citations";
import { workspaceCitationLinks } from "../schema/workspaceCitationLinks";
import type { DbOrTx } from "../types";

/** Satu chunk mirip hasil ANN search (untuk RagService.searchThreadDocuments). */
export type ArtifactEmbeddingMatch = {
  artifactId: string;
  chunkIndex: number;
  content: string;
  title: string;
  /** Terisi bila chunk berasal dari item perpustakaan. */
  citationId: string | null;
  /** Kunci `@key` sitasi; null bila belum ter-assign. */
  bibKey: string | null;
  /** Jarak cosine (`0` identik, `2` berlawanan). */
  distance: number;
};

/** Satu chunk hasil FTS leksikal (hybrid search D4); `rank` = `ts_rank` (besar = lebih relevan). */
export type ArtifactEmbeddingLexicalMatch = {
  artifactId: string;
  chunkIndex: number;
  content: string;
  title: string;
  /** Terisi bila chunk berasal dari item perpustakaan. */
  citationId: string | null;
  /** Kunci `@key` sitasi; null bila belum ter-assign. */
  bibKey: string | null;
  rank: number;
};

/**
 * Paper perpustakaan hidup di level akun (`workspace_id` null), jadi keanggotaan
 * proyeknya dibaca dari tautan referensi — bukan dari kolom pada chunk. Satu paper
 * karena itu bisa dipakai banyak proyek tanpa duplikasi, dan melepas tautan langsung
 * mempersempit hasil tanpa reindex.
 */
function workspaceScope(workspaceId: string): SQL {
  return sql`(${artifactEmbeddings.workspaceId} = ${workspaceId} or exists (
      select 1 from ${citations} c
        join ${workspaceCitationLinks} l on l.citation_id = c.id
       where c.artifact_id = ${artifactEmbeddings.artifactId}
         and l.workspace_id = ${workspaceId}
         and c.deleted_at is null
    ))`;
}

/** Identitas sitasi per chunk — subquery agar tak mempersempit hasil pencarian. */
const citationIdExpr = sql<string | null>`(select c.id from ${citations} c
    where c.artifact_id = ${artifactEmbeddings.artifactId}
      and c.deleted_at is null limit 1)`;
const bibKeyExpr = sql<string | null>`(select c.bib_key from ${citations} c
    where c.artifact_id = ${artifactEmbeddings.artifactId}
      and c.deleted_at is null limit 1)`;

/**
 * Repo artifact_embeddings (pgvector) — query Drizzle saja. P3 write/delete;
 * `searchSimilar` (ANN HNSW cosine) ditambah Slice 6.4 (searchThreadDocuments).
 */
export const ArtifactEmbeddingRepo = {
  async insertMany(db: DbOrTx, rows: NewArtifactEmbedding[]): Promise<void> {
    if (rows.length === 0) return;
    await db.insert(artifactEmbeddings).values(rows);
  },

  /**
   * ANN cosine search (HNSW `vector_cosine_ops` sudah ada). Selalu scope owner; lalu
   * scope dokumen ke thread (JOIN `artifacts.thread_id`, sebab `artifact_embeddings`
   * TIDAK punya thread_id) ATAU ke workspace (lihat `workspaceScope`).
   * Hanya artifact aktif. ORDER BY jarak ASC + LIMIT memakai index HNSW.
   */
  async searchSimilar(
    db: DbOrTx,
    args: {
      ownerUserId: string;
      queryVector: number[];
      threadId?: string;
      workspaceId?: string;
      limit: number;
    },
  ): Promise<ArtifactEmbeddingMatch[]> {
    const distance = cosineDistance(artifactEmbeddings.embedding, args.queryVector);
    const where = [
      eq(artifactEmbeddings.ownerUserId, args.ownerUserId),
      eq(artifacts.status, "active"),
    ];
    if (args.threadId) where.push(eq(artifacts.threadId, args.threadId));
    if (args.workspaceId) where.push(workspaceScope(args.workspaceId));
    const rows = await db
      .select({
        artifactId: artifactEmbeddings.artifactId,
        chunkIndex: artifactEmbeddings.chunkIndex,
        content: artifactEmbeddings.content,
        title: artifacts.title,
        citationId: citationIdExpr,
        bibKey: bibKeyExpr,
        distance,
      })
      .from(artifactEmbeddings)
      .innerJoin(artifacts, eq(artifacts.id, artifactEmbeddings.artifactId))
      .where(and(...where))
      .orderBy(distance)
      .limit(args.limit);
    return rows.map((r) => ({
      artifactId: r.artifactId,
      chunkIndex: r.chunkIndex,
      content: r.content,
      title: r.title,
      citationId: r.citationId,
      bibKey: r.bibKey,
      distance: Number(r.distance),
    }));
  },

  /**
   * Full-text lexical search (D4 hybrid) — GIN `content_tsv` + `websearch_to_tsquery('simple')`,
   * di-rank `ts_rank` DESC. Scope IDENTIK `searchSimilar` (owner + thread/workspace + artifact aktif)
   * supaya fusi RRF di RagService membandingkan kandidat dari ruang yang sama.
   */
  async searchLexical(
    db: DbOrTx,
    args: {
      ownerUserId: string;
      query: string;
      threadId?: string;
      workspaceId?: string;
      limit: number;
    },
  ): Promise<ArtifactEmbeddingLexicalMatch[]> {
    const tsq = sql`websearch_to_tsquery('simple', ${args.query})`;
    const rank = sql<number>`ts_rank(${artifactEmbeddings.contentTsv}, ${tsq})`;
    const where = [
      eq(artifactEmbeddings.ownerUserId, args.ownerUserId),
      eq(artifacts.status, "active"),
      sql`${artifactEmbeddings.contentTsv} @@ ${tsq}`,
    ];
    if (args.threadId) where.push(eq(artifacts.threadId, args.threadId));
    if (args.workspaceId) where.push(workspaceScope(args.workspaceId));
    const rows = await db
      .select({
        artifactId: artifactEmbeddings.artifactId,
        chunkIndex: artifactEmbeddings.chunkIndex,
        content: artifactEmbeddings.content,
        title: artifacts.title,
        citationId: citationIdExpr,
        bibKey: bibKeyExpr,
        rank,
      })
      .from(artifactEmbeddings)
      .innerJoin(artifacts, eq(artifacts.id, artifactEmbeddings.artifactId))
      .where(and(...where))
      .orderBy(desc(rank))
      .limit(args.limit);
    return rows.map((r) => ({
      artifactId: r.artifactId,
      chunkIndex: r.chunkIndex,
      content: r.content,
      title: r.title,
      citationId: r.citationId,
      bibKey: r.bibKey,
      rank: Number(r.rank),
    }));
  },

  async deleteByArtifact(db: DbOrTx, ownerUserId: string, artifactId: string): Promise<void> {
    await db
      .delete(artifactEmbeddings)
      .where(
        and(
          eq(artifactEmbeddings.ownerUserId, ownerUserId),
          eq(artifactEmbeddings.artifactId, artifactId),
        ),
      );
  },

  async setWorkspaceByArtifactIds(
    db: DbOrTx,
    artifactIds: string[],
    workspaceId: string,
  ): Promise<void> {
    if (artifactIds.length === 0) return;
    await db
      .update(artifactEmbeddings)
      .set({ workspaceId })
      .where(inArray(artifactEmbeddings.artifactId, artifactIds));
  },

  async deleteByArtifactIds(db: DbOrTx, artifactIds: string[]): Promise<void> {
    if (artifactIds.length === 0) return;
    await db
      .delete(artifactEmbeddings)
      .where(inArray(artifactEmbeddings.artifactId, artifactIds));
  },
};

import { and, cosineDistance, eq, inArray } from "drizzle-orm";
import { artifacts } from "../schema/artifacts";
import {
  artifactEmbeddings,
  type NewArtifactEmbedding,
} from "../schema/artifactEmbeddings";
import type { DbOrTx } from "../types";

/** Satu chunk mirip hasil ANN search (untuk RagService.searchThreadDocuments). */
export type ArtifactEmbeddingMatch = {
  artifactId: string;
  chunkIndex: number;
  content: string;
  title: string;
  /** Jarak cosine (`0` identik, `2` berlawanan). */
  distance: number;
};

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
   * TIDAK punya thread_id) ATAU ke workspace (`artifact_embeddings.workspace_id`).
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
    if (args.workspaceId) where.push(eq(artifactEmbeddings.workspaceId, args.workspaceId));
    const rows = await db
      .select({
        artifactId: artifactEmbeddings.artifactId,
        chunkIndex: artifactEmbeddings.chunkIndex,
        content: artifactEmbeddings.content,
        title: artifacts.title,
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
      distance: Number(r.distance),
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

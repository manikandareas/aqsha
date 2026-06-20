import { and, eq, inArray } from "drizzle-orm";
import {
  artifactEmbeddings,
  type NewArtifactEmbedding,
} from "../schema/artifactEmbeddings";
import type { DbOrTx } from "../types";

/**
 * Repo artifact_embeddings (pgvector) — query Drizzle saja. P3 hanya write/delete;
 * similarity search (ANN HNSW) menyusul di P6 (searchThreadDocuments).
 */
export const ArtifactEmbeddingRepo = {
  async insertMany(db: DbOrTx, rows: NewArtifactEmbedding[]): Promise<void> {
    if (rows.length === 0) return;
    await db.insert(artifactEmbeddings).values(rows);
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

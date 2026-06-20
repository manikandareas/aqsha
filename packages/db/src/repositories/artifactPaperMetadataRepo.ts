import { and, eq, inArray } from "drizzle-orm";
import {
  type ArtifactPaperMetadata,
  artifactPaperMetadata,
  type NewArtifactPaperMetadata,
} from "../schema/artifactPaperMetadata";
import type { DbOrTx } from "../types";

/** Repo artifact_paper_metadata (1:1 metadata) — query Drizzle saja. */
export const ArtifactPaperMetadataRepo = {
  async findByArtifact(
    db: DbOrTx,
    ownerUserId: string,
    artifactId: string,
  ): Promise<ArtifactPaperMetadata | null> {
    const rows = await db
      .select()
      .from(artifactPaperMetadata)
      .where(
        and(
          eq(artifactPaperMetadata.ownerUserId, ownerUserId),
          eq(artifactPaperMetadata.artifactId, artifactId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  },

  async insert(db: DbOrTx, row: NewArtifactPaperMetadata): Promise<void> {
    await db.insert(artifactPaperMetadata).values(row);
  },

  async updateById(
    db: DbOrTx,
    id: string,
    patch: Partial<NewArtifactPaperMetadata>,
  ): Promise<void> {
    await db.update(artifactPaperMetadata).set(patch).where(eq(artifactPaperMetadata.id, id));
  },

  async setWorkspaceByArtifactIds(
    db: DbOrTx,
    artifactIds: string[],
    workspaceId: string,
    now: number,
  ): Promise<void> {
    if (artifactIds.length === 0) return;
    await db
      .update(artifactPaperMetadata)
      .set({ workspaceId, updatedAt: now })
      .where(inArray(artifactPaperMetadata.artifactId, artifactIds));
  },

  async deleteByArtifactIds(db: DbOrTx, artifactIds: string[]): Promise<void> {
    if (artifactIds.length === 0) return;
    await db
      .delete(artifactPaperMetadata)
      .where(inArray(artifactPaperMetadata.artifactId, artifactIds));
  },
};

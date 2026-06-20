import { and, eq, inArray } from "drizzle-orm";
import {
  type ArtifactContent,
  artifactContents,
  type NewArtifactContent,
} from "../schema/artifactContents";
import type { DbOrTx } from "../types";

/** Repo artifact_contents (1:1 body) — query Drizzle saja. */
export const ArtifactContentRepo = {
  async findByArtifact(
    db: DbOrTx,
    ownerUserId: string,
    artifactId: string,
  ): Promise<ArtifactContent | null> {
    const rows = await db
      .select()
      .from(artifactContents)
      .where(
        and(
          eq(artifactContents.ownerUserId, ownerUserId),
          eq(artifactContents.artifactId, artifactId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  },

  async insert(db: DbOrTx, row: NewArtifactContent): Promise<void> {
    await db.insert(artifactContents).values(row);
  },

  async updateByArtifact(
    db: DbOrTx,
    artifactId: string,
    patch: Partial<NewArtifactContent>,
  ): Promise<void> {
    await db.update(artifactContents).set(patch).where(eq(artifactContents.artifactId, artifactId));
  },

  async setWorkspaceByArtifactIds(
    db: DbOrTx,
    artifactIds: string[],
    workspaceId: string,
    now: number,
  ): Promise<void> {
    if (artifactIds.length === 0) return;
    await db
      .update(artifactContents)
      .set({ workspaceId, updatedAt: now })
      .where(inArray(artifactContents.artifactId, artifactIds));
  },

  async deleteByArtifactIds(db: DbOrTx, artifactIds: string[]): Promise<void> {
    if (artifactIds.length === 0) return;
    await db.delete(artifactContents).where(inArray(artifactContents.artifactId, artifactIds));
  },
};

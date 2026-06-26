import { and, eq, inArray } from "drizzle-orm";
import { type ArtifactUrl, artifactUrls, type NewArtifactUrl } from "../schema/artifactUrls";
import type { DbOrTx } from "../types";

/** Repo artifact_urls (1:1 url) — query Drizzle saja. */
export const ArtifactUrlRepo = {
  async findByArtifact(
    db: DbOrTx,
    ownerUserId: string,
    artifactId: string,
  ): Promise<ArtifactUrl | null> {
    const rows = await db
      .select()
      .from(artifactUrls)
      .where(
        and(eq(artifactUrls.ownerUserId, ownerUserId), eq(artifactUrls.artifactId, artifactId)),
      )
      .limit(1);
    return rows[0] ?? null;
  },

  /** Dedupe lookup (owner, workspace, normalizedUrl) — backs createUrl idempotency. */
  async findByNormalizedUrl(
    db: DbOrTx,
    ownerUserId: string,
    workspaceId: string,
    normalizedUrl: string,
  ): Promise<ArtifactUrl | null> {
    const rows = await db
      .select()
      .from(artifactUrls)
      .where(
        and(
          eq(artifactUrls.ownerUserId, ownerUserId),
          eq(artifactUrls.workspaceId, workspaceId),
          eq(artifactUrls.normalizedUrl, normalizedUrl),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  },

  async insert(db: DbOrTx, row: NewArtifactUrl): Promise<void> {
    await db.insert(artifactUrls).values(row);
  },

  async updateByArtifact(
    db: DbOrTx,
    artifactId: string,
    patch: Partial<NewArtifactUrl>,
  ): Promise<void> {
    await db.update(artifactUrls).set(patch).where(eq(artifactUrls.artifactId, artifactId));
  },

  async setWorkspaceByArtifactIds(
    db: DbOrTx,
    artifactIds: string[],
    workspaceId: string,
    now: number,
  ): Promise<void> {
    if (artifactIds.length === 0) return;
    await db
      .update(artifactUrls)
      .set({ workspaceId, updatedAt: now })
      .where(inArray(artifactUrls.artifactId, artifactIds));
  },

  async deleteByArtifactIds(db: DbOrTx, artifactIds: string[]): Promise<void> {
    if (artifactIds.length === 0) return;
    await db.delete(artifactUrls).where(inArray(artifactUrls.artifactId, artifactIds));
  },
};

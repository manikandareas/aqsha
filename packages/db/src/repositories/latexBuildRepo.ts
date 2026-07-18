import { and, eq, isNull } from "drizzle-orm";
import { type LatexBuild, latexBuilds, type NewLatexBuild } from "../schema/latexBuilds";
import type { DbOrTx } from "../types";

/** Repo latex_builds (latest-only per scope) — upsert manual di service (select → update/insert). */
export const LatexBuildRepo = {
  async findBySection(
    db: DbOrTx,
    ownerUserId: string,
    sectionId: string,
  ): Promise<LatexBuild | null> {
    const rows = await db
      .select()
      .from(latexBuilds)
      .where(and(eq(latexBuilds.ownerUserId, ownerUserId), eq(latexBuilds.sectionId, sectionId)))
      .limit(1);
    return rows[0] ?? null;
  },

  async findFullByWorkspace(
    db: DbOrTx,
    ownerUserId: string,
    workspaceId: string,
  ): Promise<LatexBuild | null> {
    const rows = await db
      .select()
      .from(latexBuilds)
      .where(
        and(
          eq(latexBuilds.ownerUserId, ownerUserId),
          eq(latexBuilds.workspaceId, workspaceId),
          isNull(latexBuilds.sectionId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  },

  async insert(db: DbOrTx, row: NewLatexBuild): Promise<void> {
    await db.insert(latexBuilds).values(row);
  },

  async updateById(db: DbOrTx, id: string, patch: Partial<NewLatexBuild>): Promise<void> {
    await db.update(latexBuilds).set(patch).where(eq(latexBuilds.id, id));
  },
};

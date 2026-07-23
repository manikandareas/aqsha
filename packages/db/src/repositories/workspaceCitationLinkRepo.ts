import { and, eq, inArray } from "drizzle-orm";
import {
  type NewWorkspaceCitationLink,
  type WorkspaceCitationLink,
  workspaceCitationLinks,
} from "../schema/workspaceCitationLinks";
import type { DbOrTx } from "../types";

/** Repo workspace_citation_links — query Drizzle saja. */
export const WorkspaceCitationLinkRepo = {
  /** Idempotent per (workspace, citation) — link ganda diserap unique index. */
  async insert(db: DbOrTx, row: NewWorkspaceCitationLink): Promise<void> {
    await db.insert(workspaceCitationLinks).values(row).onConflictDoNothing();
  },

  async insertMany(db: DbOrTx, rows: NewWorkspaceCitationLink[]): Promise<number> {
    if (rows.length === 0) return 0;
    const inserted = await db
      .insert(workspaceCitationLinks)
      .values(rows)
      .onConflictDoNothing()
      .returning({ id: workspaceCitationLinks.id });
    return inserted.length;
  },

  async deleteByWorkspaceAndCitation(
    db: DbOrTx,
    workspaceId: string,
    citationId: string,
  ): Promise<void> {
    await db
      .delete(workspaceCitationLinks)
      .where(
        and(
          eq(workspaceCitationLinks.workspaceId, workspaceId),
          eq(workspaceCitationLinks.citationId, citationId),
        ),
      );
  },

  async deleteManyByWorkspaceAndCitationIds(
    db: DbOrTx,
    workspaceId: string,
    citationIds: string[],
  ): Promise<number> {
    if (citationIds.length === 0) return 0;
    const rows = await db
      .delete(workspaceCitationLinks)
      .where(
        and(
          eq(workspaceCitationLinks.workspaceId, workspaceId),
          inArray(workspaceCitationLinks.citationId, citationIds),
        ),
      )
      .returning({ id: workspaceCitationLinks.id });
    return rows.length;
  },

  async findById(db: DbOrTx, id: string): Promise<WorkspaceCitationLink | null> {
    const rows = await db
      .select()
      .from(workspaceCitationLinks)
      .where(eq(workspaceCitationLinks.id, id))
      .limit(1);
    return rows[0] ?? null;
  },

  async listByWorkspace(db: DbOrTx, workspaceId: string): Promise<WorkspaceCitationLink[]> {
    return db
      .select()
      .from(workspaceCitationLinks)
      .where(eq(workspaceCitationLinks.workspaceId, workspaceId));
  },

  async listLinkedCitationIds(
    db: DbOrTx,
    workspaceId: string,
    citationIds: string[],
  ): Promise<string[]> {
    if (citationIds.length === 0) return [];
    const rows = await db
      .select({ citationId: workspaceCitationLinks.citationId })
      .from(workspaceCitationLinks)
      .where(
        and(
          eq(workspaceCitationLinks.workspaceId, workspaceId),
          inArray(workspaceCitationLinks.citationId, citationIds),
        ),
      );
    return rows.map((r) => r.citationId);
  },

  async exists(db: DbOrTx, workspaceId: string, citationId: string): Promise<boolean> {
    const rows = await db
      .select({ id: workspaceCitationLinks.id })
      .from(workspaceCitationLinks)
      .where(
        and(
          eq(workspaceCitationLinks.workspaceId, workspaceId),
          eq(workspaceCitationLinks.citationId, citationId),
        ),
      )
      .limit(1);
    return rows.length > 0;
  },

  /**
   * Salin keanggotaan proyek dari citation sumber ke target kanonik, lalu hapus
   * link sumber — conflict absorption menjaga proyek yang sudah punya target.
   */
  async moveLinksToCitation(
    db: DbOrTx,
    sourceCitationIds: string[],
    targetCitationId: string,
  ): Promise<void> {
    if (sourceCitationIds.length === 0) return;
    const links = await db
      .select()
      .from(workspaceCitationLinks)
      .where(inArray(workspaceCitationLinks.citationId, sourceCitationIds));
    const workspaceIds = [...new Set(links.map((l) => l.workspaceId))];
    if (workspaceIds.length > 0) {
      const now = Date.now();
      await db
        .insert(workspaceCitationLinks)
        .values(
          workspaceIds.map((workspaceId) => ({
            id: crypto.randomUUID(),
            workspaceId,
            citationId: targetCitationId,
            createdAt: now,
          })),
        )
        .onConflictDoNothing();
    }
    await db
      .delete(workspaceCitationLinks)
      .where(inArray(workspaceCitationLinks.citationId, sourceCitationIds));
  },
};

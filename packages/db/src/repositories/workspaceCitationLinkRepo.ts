import { and, eq } from "drizzle-orm";
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

  async listBySection(db: DbOrTx, sectionId: string): Promise<WorkspaceCitationLink[]> {
    return db
      .select()
      .from(workspaceCitationLinks)
      .where(eq(workspaceCitationLinks.sectionId, sectionId));
  },

  async setSection(db: DbOrTx, linkId: string, sectionId: string | null): Promise<void> {
    await db
      .update(workspaceCitationLinks)
      .set({ sectionId })
      .where(eq(workspaceCitationLinks.id, linkId));
  },
};

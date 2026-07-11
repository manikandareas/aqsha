import { eq } from "drizzle-orm";
import {
  type NewWorkspaceCitationSettings,
  type WorkspaceCitationSettings,
  workspaceCitationSettings,
} from "../schema/workspaceCitationSettings";
import type { DbOrTx } from "../types";

/** Repo workspace_citation_settings (1:1 workspace) — upsert-patch seperti userAgentPreferencesRepo. */
export const WorkspaceCitationSettingsRepo = {
  async findByWorkspace(
    db: DbOrTx,
    workspaceId: string,
  ): Promise<WorkspaceCitationSettings | null> {
    const rows = await db
      .select()
      .from(workspaceCitationSettings)
      .where(eq(workspaceCitationSettings.workspaceId, workspaceId))
      .limit(1);
    return rows[0] ?? null;
  },

  async upsert(
    db: DbOrTx,
    row: NewWorkspaceCitationSettings,
    patch: Partial<Pick<NewWorkspaceCitationSettings, "defaultStyleId" | "bibliographySort">>,
  ): Promise<void> {
    await db
      .insert(workspaceCitationSettings)
      .values(row)
      .onConflictDoUpdate({
        target: workspaceCitationSettings.workspaceId,
        set: { ...patch, updatedAt: row.updatedAt },
      });
  },
};

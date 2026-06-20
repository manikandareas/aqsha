import { WorkspaceRepo } from "@aqsha/db";
import type { DbOrTx } from "@aqsha/db";
import { workspaceEmojiForNewWorkspace } from "./workspaces/emoji";

export const DEFAULT_WORKSPACE_NAME = "Workspace Saya";

/** Workspace seam. Di P1 hanya cold-start default workspace; CRUD penuh P2. */
export const WorkspaceService = {
  /**
   * Idempotent: kembalikan id workspace terbaru milik owner bila ada; selain itu
   * buat "Workspace Saya" (emoji deterministik, status active). Port V1
   * `ensureDefaultWorkspaceForOwner`.
   */
  async ensureDefaultWorkspaceForOwner(db: DbOrTx, ownerUserId: string): Promise<string> {
    const existing = await WorkspaceRepo.findNewestByOwner(db, ownerUserId);
    if (existing) return existing.id;

    const now = Date.now();
    const id = crypto.randomUUID();
    await WorkspaceRepo.insert(db, {
      id,
      ownerUserId,
      name: DEFAULT_WORKSPACE_NAME,
      emoji: workspaceEmojiForNewWorkspace({ ownerUserId, name: DEFAULT_WORKSPACE_NAME, now }),
      description: null,
      status: "active",
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  },
};

import {
  type Citation,
  CitationRepo,
  throwAppError,
  WorkspaceCitationLinkRepo,
} from "@aqsha/db";
import type { Db, DbOrTx } from "@aqsha/db";
import { WorkspaceService } from "../workspace.service";

/** Koleksi sumber per proyek — link perpustakaan↔proyek, bukan salinan. Semua link level proyek. */
export const CitationLinkService = {
  async addToWorkspace(
    db: Db | DbOrTx,
    input: { ownerUserId: string; workspaceId: string; citationId: string },
  ): Promise<{ ok: true }> {
    await WorkspaceService.assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId, {
      requireActive: true,
    });
    const citation = await CitationRepo.findById(db, input.ownerUserId, input.citationId);
    if (!citation || citation.deletedAt) {
      throwAppError({
        message: "Referensi tidak ditemukan",
        code: "citation_not_found",
        severity: "error",
        status: 404,
      });
    }
    await WorkspaceCitationLinkRepo.insert(db, {
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      citationId: input.citationId,
      createdAt: Date.now(),
    });
    return { ok: true };
  },

  async removeFromWorkspace(
    db: DbOrTx,
    input: { ownerUserId: string; workspaceId: string; citationId: string },
  ): Promise<{ ok: true }> {
    await WorkspaceService.assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId);
    await WorkspaceCitationLinkRepo.deleteByWorkspaceAndCitation(
      db,
      input.workspaceId,
      input.citationId,
    );
    return { ok: true };
  },

  /** Item perpustakaan yang ter-link ke proyek, digabung id link. */
  async listForWorkspace(
    db: DbOrTx,
    ownerUserId: string,
    workspaceId: string,
  ): Promise<{ items: Array<Citation & { linkId: string }> }> {
    await WorkspaceService.assertWorkspaceOwner(db, ownerUserId, workspaceId);
    const links = await WorkspaceCitationLinkRepo.listByWorkspace(db, workspaceId);
    if (links.length === 0) return { items: [] };
    const rows = await CitationRepo.findByIds(
      db,
      ownerUserId,
      links.map((l) => l.citationId),
    );
    const byId = new Map(rows.map((c) => [c.id, c]));
    const items = links.flatMap((l) => {
      const c = byId.get(l.citationId);
      return c && !c.deletedAt ? [{ ...c, linkId: l.id }] : [];
    });
    return { items };
  },
};

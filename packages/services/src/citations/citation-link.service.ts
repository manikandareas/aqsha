import {
  type Citation,
  CitationRepo,
  throwAppError,
  WorkspaceCitationLinkRepo,
} from "@aqsha/db";
import type { Db, DbOrTx } from "@aqsha/db";
import { SectionService } from "../section.service";
import { WorkspaceService } from "../workspace.service";

/** Koleksi sumber per proyek — link perpustakaan↔proyek(↔bab), bukan salinan. */
export const CitationLinkService = {
  async addToWorkspace(
    db: Db | DbOrTx,
    input: {
      ownerUserId: string;
      workspaceId: string;
      citationId: string;
      sectionId?: string | null;
    },
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
    if (input.sectionId) {
      const section = await SectionService.assertSectionOwner(
        db,
        input.ownerUserId,
        input.sectionId,
      );
      if (section.workspaceId !== input.workspaceId) {
        throwAppError({
          message: "Bab ini bukan bagian dari proyek tersebut",
          code: "section_workspace_mismatch",
          severity: "warning",
          status: 409,
        });
      }
    }
    await WorkspaceCitationLinkRepo.insert(db, {
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      citationId: input.citationId,
      sectionId: input.sectionId ?? null,
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

  /** Item perpustakaan yang ter-link ke proyek, digabung metadata link (bab). */
  async listForWorkspace(
    db: DbOrTx,
    ownerUserId: string,
    workspaceId: string,
  ): Promise<{ items: Array<Citation & { linkId: string; sectionId: string | null }> }> {
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
      return c && !c.deletedAt ? [{ ...c, linkId: l.id, sectionId: l.sectionId }] : [];
    });
    return { items };
  },

  /** Pindahkan penanda bab sebuah link (null = kembali ke level proyek). */
  async assignSection(
    db: DbOrTx,
    input: { ownerUserId: string; linkId: string; sectionId: string | null },
  ): Promise<{ ok: true }> {
    const link = await WorkspaceCitationLinkRepo.findById(db, input.linkId);
    if (!link) {
      throwAppError({
        message: "Link referensi tidak ditemukan",
        code: "citation_link_not_found",
        severity: "error",
        status: 404,
      });
    }
    await WorkspaceService.assertWorkspaceOwner(db, input.ownerUserId, link.workspaceId);
    if (input.sectionId) {
      const section = await SectionService.assertSectionOwner(
        db,
        input.ownerUserId,
        input.sectionId,
      );
      if (section.workspaceId !== link.workspaceId) {
        throwAppError({
          message: "Bab ini bukan bagian dari proyek tersebut",
          code: "section_workspace_mismatch",
          severity: "warning",
          status: 409,
        });
      }
    }
    await WorkspaceCitationLinkRepo.setSection(db, input.linkId, input.sectionId);
    return { ok: true };
  },
};

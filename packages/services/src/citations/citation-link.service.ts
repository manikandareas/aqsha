import {
  type CitationMetadataStatus,
  type CitationSource,
  CitationRepo,
  decodeKeysetCursor,
  throwAppError,
  WorkspaceCitationLinkRepo,
} from "@aqsha/db";
import type { Db, DbOrTx } from "@aqsha/db";
import { WorkspaceService } from "../workspace.service";
import {
  type CitationListItem,
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
  toListItem,
} from "./citation-model";

export type CitationListResponse = {
  items: CitationListItem[];
  nextCursor: string | null;
  total: number;
};

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

  /** Item perpustakaan tertaut proyek — bentuk sama dengan list global (tanpa linkId). */
  async listForWorkspace(
    db: DbOrTx,
    input: {
      ownerUserId: string;
      workspaceId: string;
      limit?: number;
      cursor?: string | null;
      q?: string;
      status?: CitationMetadataStatus;
      source?: CitationSource;
      tag?: string;
    },
  ): Promise<CitationListResponse> {
    await WorkspaceService.assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId);
    const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIST_LIMIT, 1), MAX_LIST_LIMIT);
    const [page, total] = await Promise.all([
      CitationRepo.listByWorkspace(db, {
        ownerUserId: input.ownerUserId,
        workspaceId: input.workspaceId,
        limit,
        cursor: decodeKeysetCursor(input.cursor),
        filters: {
          q: input.q?.trim() || undefined,
          status: input.status,
          source: input.source,
          tag: input.tag,
        },
      }),
      CitationRepo.countActiveByWorkspace(db, input.ownerUserId, input.workspaceId),
    ]);
    return {
      items: page.items.map(toListItem),
      nextCursor: page.nextCursor,
      total,
    };
  },
};

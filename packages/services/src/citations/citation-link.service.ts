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
import type { CitationExportFormat } from "./citation-format";
import {
  type CitationDetail,
  type CitationListItem,
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
  toListItem,
} from "./citation-model";
import { CitationService } from "./citation.service";

export type CitationListResponse = {
  items: CitationListItem[];
  nextCursor: string | null;
  total: number;
};

export type CitationCandidateItem = CitationListItem & { linked: boolean };

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

  async removeManyFromWorkspace(
    db: DbOrTx,
    input: { ownerUserId: string; workspaceId: string; citationIds: string[] },
  ): Promise<{ affected: number }> {
    await WorkspaceService.assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId);
    const citationIds = [...new Set(input.citationIds)];
    const affected = await WorkspaceCitationLinkRepo.deleteManyByWorkspaceAndCitationIds(
      db,
      input.workspaceId,
      citationIds,
    );
    return { affected };
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

  async listTagsForWorkspace(
    db: DbOrTx,
    input: { ownerUserId: string; workspaceId: string },
  ): Promise<string[]> {
    await WorkspaceService.assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId);
    return CitationRepo.listActiveTagsByWorkspace(db, input.ownerUserId, input.workspaceId);
  },

  async listCandidates(
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
  ): Promise<{ items: CitationCandidateItem[]; nextCursor: string | null; total: number }> {
    await WorkspaceService.assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId);
    const page = await CitationService.list(db, {
      ownerUserId: input.ownerUserId,
      limit: input.limit,
      cursor: input.cursor,
      q: input.q,
      status: input.status,
      source: input.source,
      tag: input.tag,
    });
    const linkedIds = new Set(
      await WorkspaceCitationLinkRepo.listLinkedCitationIds(
        db,
        input.workspaceId,
        page.items.map((item) => item.id),
      ),
    );
    return {
      items: page.items.map((item) => ({ ...item, linked: linkedIds.has(item.id) })),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async getForWorkspace(
    db: DbOrTx,
    input: { ownerUserId: string; workspaceId: string; citationId: string },
  ): Promise<CitationDetail> {
    await WorkspaceService.assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId);
    const linked = await WorkspaceCitationLinkRepo.exists(
      db,
      input.workspaceId,
      input.citationId,
    );
    if (!linked) {
      throwAppError({
        message: "Referensi tidak tertaut ke proyek ini",
        code: "citation_not_in_workspace",
        status: 404,
        severity: "warning",
      });
    }
    return CitationService.get(db, {
      ownerUserId: input.ownerUserId,
      citationId: input.citationId,
    });
  },

  async exportForWorkspace(
    db: DbOrTx,
    input: {
      ownerUserId: string;
      workspaceId: string;
      format: CitationExportFormat;
      citationIds?: string[];
    },
  ): Promise<{ content: string; mimeType: string; filename: string }> {
    await WorkspaceService.assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId);
    let citationIds = input.citationIds;
    if (citationIds?.length) {
      const uniqueIds = [...new Set(citationIds)];
      const linked = await WorkspaceCitationLinkRepo.listLinkedCitationIds(
        db,
        input.workspaceId,
        uniqueIds,
      );
      if (linked.length !== uniqueIds.length) {
        throwAppError({
          message: "Referensi tidak tertaut ke proyek ini",
          code: "citation_not_in_workspace",
          status: 404,
          severity: "warning",
        });
      }
      citationIds = uniqueIds;
    } else {
      const rows = await CitationRepo.listAllActiveByWorkspace(
        db,
        input.ownerUserId,
        input.workspaceId,
      );
      citationIds = rows.map((r) => r.id);
    }
    // Always pass explicit IDs so an empty project never falls through to account-wide export.
    if (citationIds.length === 0) {
      throwAppError({
        message: "Tidak ada referensi untuk diekspor",
        code: "citation_export_empty",
        severity: "info",
      });
    }
    return CitationService.export(db, {
      ownerUserId: input.ownerUserId,
      format: input.format,
      citationIds,
    });
  },
};

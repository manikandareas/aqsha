import type { BibliographySort, CitationStyleId, DbOrTx } from "@aqsha/db";
import {
  CitationRepo,
  DocumentCitationUsageRepo,
  WorkspaceCitationSettingsRepo,
} from "@aqsha/db";
import { WorkspaceService } from "../workspace.service";
import {
  type DocumentCluster,
  isCitationStyleId,
  renderBibliography,
  renderBibliographyEntries,
  renderDocumentCitations,
} from "./citation-format";
import type { CslItem } from "./citation-normalize";
import {
  type CitationSettingsView,
  DEFAULT_SORT,
  DEFAULT_STYLE,
} from "./citation-model";

export const citationRenderMethods = {
  /**
   * Render preview per-citation + bibliography utuh pada style tertentu. `workspaceId`
   * opsional: dengan proyek, gaya sitasi ikut pengaturan proyek; tanpa proyek (konteks
   * perpustakaan akun) dipakai default global.
   */
  async render(
    db: DbOrTx,
    input: {
      ownerUserId: string;
      workspaceId?: string;
      styleId?: string;
      citationIds?: string[];
    },
  ): Promise<{
    styleId: CitationStyleId;
    entries: Array<{ id: string; text: string }>;
    bibliography: string;
  }> {
    // Tanpa workspace (konteks perpustakaan akun) tidak ada settings proyek —
    // pakai default global.
    const settings = input.workspaceId
      ? await this.getSettings(db, {
          ownerUserId: input.ownerUserId,
          workspaceId: input.workspaceId,
        })
      : { defaultStyleId: DEFAULT_STYLE, bibliographySort: DEFAULT_SORT };
    const styleId =
      input.styleId && isCitationStyleId(input.styleId)
        ? input.styleId
        : settings.defaultStyleId;
    const rows = input.citationIds?.length
      ? (
          await CitationRepo.findByIds(db, input.ownerUserId, input.citationIds)
        ).filter((r) => !r.deletedAt)
      : await CitationRepo.listAllActive(db, input.ownerUserId);
    const items = rows.map((r) => ({ ...(r.cslJson as CslItem), id: r.id }));
    return {
      styleId,
      entries: renderBibliographyEntries(items, styleId),
      bibliography: renderBibliography(
        items,
        styleId,
        settings.bibliographySort,
      ),
    };
  },

  /**
   * Daftar pustaka proyek: agregat sitasi yang benar-benar terpakai di dokumen
   * bab-bab (document_citation_usages), dirender dengan gaya proyek. Urutan akhir
   * mengikuti aturan sort gaya (citeproc), bukan urutan kemunculan.
   */
  async renderWorkspaceBibliography(
    db: DbOrTx,
    input: { ownerUserId: string; workspaceId: string },
  ): Promise<{
    styleId: CitationStyleId;
    entries: Array<{ id: string; text: string }>;
  }> {
    await WorkspaceService.assertWorkspaceOwner(
      db,
      input.ownerUserId,
      input.workspaceId,
    );
    const usages = await DocumentCitationUsageRepo.listByWorkspace(
      db,
      input.ownerUserId,
      input.workspaceId,
    );
    const citationIds = [...new Set(usages.map((u) => u.citationId))];
    if (citationIds.length === 0) {
      const settings = await this.getSettings(db, {
        ownerUserId: input.ownerUserId,
        workspaceId: input.workspaceId,
      });
      return {
        styleId: settings.defaultStyleId as CitationStyleId,
        entries: [],
      };
    }
    const rendered = await this.render(db, {
      ownerUserId: input.ownerUserId,
      workspaceId: input.workspaceId,
      citationIds,
    });
    return { styleId: rendered.styleId, entries: rendered.entries };
  },

  /**
   * Render sitasi in-text seluruh dokumen (per cluster, numbering konsisten) +
   * bibliography used-in-document. `clusters` urut kemunculan di dokumen; id yang
   * sudah dihapus/tak ada dilaporkan di `missingIds` supaya editor bisa menandai
   * node missing alih-alih menghilangkannya diam-diam.
   */
  async renderDocument(
    db: DbOrTx,
    input: {
      ownerUserId: string;
      workspaceId: string;
      styleId?: string;
      clusters: Array<{
        nodeId: string;
        citationIds: string[];
        locator?: string;
        label?: string;
        prefix?: string;
        suffix?: string;
      }>;
    },
  ): Promise<{
    styleId: CitationStyleId;
    clusters: Array<{ nodeId: string; text: string }>;
    bibliography: Array<{ id: string; text: string }>;
    missingIds: string[];
  }> {
    const settings = await this.getSettings(db, {
      ownerUserId: input.ownerUserId,
      workspaceId: input.workspaceId,
    });
    const styleId =
      input.styleId && isCitationStyleId(input.styleId)
        ? input.styleId
        : settings.defaultStyleId;

    const referencedIds = [
      ...new Set(input.clusters.flatMap((c) => c.citationIds)),
    ];
    const rows = referencedIds.length
      ? (
          await CitationRepo.findByIds(db, input.ownerUserId, referencedIds)
        ).filter((r) => !r.deletedAt)
      : [];
    const byId = new Map(rows.map((r) => [r.id, r]));
    const items = rows.map((r) => ({ ...(r.cslJson as CslItem), id: r.id }));
    const missingIds = referencedIds.filter((id) => !byId.has(id));

    const docClusters: DocumentCluster[] = input.clusters.map((cluster) => {
      const presentIds = cluster.citationIds.filter((id) => byId.has(id));
      return {
        nodeId: cluster.nodeId,
        items: presentIds.map((id, idx) => {
          // Locator/affix hanya bermakna untuk sitasi tunggal → item pertama cluster.
          if (
            idx === 0 &&
            (cluster.locator || cluster.prefix || cluster.suffix)
          ) {
            return {
              id,
              ...(cluster.locator
                ? { locator: cluster.locator, label: cluster.label || "page" }
                : {}),
              ...(cluster.prefix ? { prefix: cluster.prefix } : {}),
              ...(cluster.suffix ? { suffix: cluster.suffix } : {}),
            };
          }
          return { id };
        }),
      };
    });

    const rendered = renderDocumentCitations(items, docClusters, styleId);
    return {
      styleId,
      clusters: rendered.clusters,
      bibliography: rendered.bibliography,
      missingIds,
    };
  },

  async getSettings(
    db: DbOrTx,
    input: { ownerUserId: string; workspaceId: string },
  ): Promise<CitationSettingsView> {
    await WorkspaceService.assertWorkspaceOwner(
      db,
      input.ownerUserId,
      input.workspaceId,
    );
    const row = await WorkspaceCitationSettingsRepo.findByWorkspace(
      db,
      input.workspaceId,
    );
    return {
      defaultStyleId:
        (row?.defaultStyleId as CitationStyleId | undefined) ?? DEFAULT_STYLE,
      bibliographySort:
        (row?.bibliographySort as BibliographySort | undefined) ?? DEFAULT_SORT,
    };
  },

  async updateSettings(
    db: DbOrTx,
    input: {
      ownerUserId: string;
      workspaceId: string;
      defaultStyleId?: CitationStyleId;
      bibliographySort?: BibliographySort;
    },
  ): Promise<CitationSettingsView> {
    await WorkspaceService.assertWorkspaceOwner(
      db,
      input.ownerUserId,
      input.workspaceId,
    );
    const now = Date.now();
    await WorkspaceCitationSettingsRepo.upsert(
      db,
      {
        workspaceId: input.workspaceId,
        ownerUserId: input.ownerUserId,
        defaultStyleId: input.defaultStyleId ?? DEFAULT_STYLE,
        bibliographySort: input.bibliographySort ?? DEFAULT_SORT,
        createdAt: now,
        updatedAt: now,
      },
      {
        ...(input.defaultStyleId
          ? { defaultStyleId: input.defaultStyleId }
          : {}),
        ...(input.bibliographySort
          ? { bibliographySort: input.bibliographySort }
          : {}),
      },
    );
    return this.getSettings(db, {
      ownerUserId: input.ownerUserId,
      workspaceId: input.workspaceId,
    });
  },
};

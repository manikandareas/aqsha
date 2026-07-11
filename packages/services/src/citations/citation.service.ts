import type {
  BibliographySort,
  CitationAuthor,
  CitationMetadataStatus,
  CitationSource,
  CitationStyleId,
  Db,
  DbOrTx,
  NewWorkspaceCitation,
  WorkspaceCitation,
} from "@aqsha/db";
import {
  decodeKeysetCursor,
  throwAppError,
  WorkspaceCitationRepo,
  WorkspaceCitationSettingsRepo,
} from "@aqsha/db";
import { classifyPaperText } from "../papers/identifiers";
import { resolvePaper } from "../papers/resolve";
import { WorkspaceService } from "../workspace.service";
import {
  type CitationExportFormat,
  exportCitations,
  isCitationStyleId,
  renderBibliography,
  renderBibliographyEntries,
} from "./citation-format";
import {
  buildCslFromManualInput,
  canonicalKeyForCsl,
  cslItemToColumns,
  type CslItem,
  type ManualCitationInput,
  metadataStatusFor,
  normalizeDoi,
  normalizeTags,
} from "./citation-normalize";

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;
const DEFAULT_STYLE: CitationStyleId = "apa-7";
const DEFAULT_SORT: BibliographySort = "author";

export type CitationListItem = {
  id: string;
  documentType: string;
  title: string;
  authors: CitationAuthor[];
  publishedYear: number | null;
  venue: string | null;
  doi: string | null;
  url: string | null;
  tags: string[];
  source: CitationSource;
  metadataStatus: CitationMetadataStatus;
  artifactId: string | null;
  updatedAt: number;
};

export type CitationDetail = CitationListItem & {
  publisher: string | null;
  cslJson: unknown;
  canonicalKey: string;
  reviewedAt: number | null;
  createdAt: number;
  deletedAt: number | null;
};

export type CitationSettingsView = {
  defaultStyleId: CitationStyleId;
  bibliographySort: BibliographySort;
};

function toListItem(row: WorkspaceCitation): CitationListItem {
  return {
    id: row.id,
    documentType: row.documentType,
    title: row.title,
    authors: row.authorsJson,
    publishedYear: row.publishedYear,
    venue: row.venue,
    doi: row.doi,
    url: row.url,
    tags: row.tags,
    source: row.source as CitationSource,
    metadataStatus: row.metadataStatus as CitationMetadataStatus,
    artifactId: row.artifactId,
    updatedAt: row.updatedAt,
  };
}

function toDetail(row: WorkspaceCitation): CitationDetail {
  return {
    ...toListItem(row),
    publisher: row.publisher,
    cslJson: row.cslJson,
    canonicalKey: row.canonicalKey,
    reviewedAt: row.reviewedAt,
    createdAt: row.createdAt,
    deletedAt: row.deletedAt,
  };
}

async function requireCitation(
  db: DbOrTx,
  ownerUserId: string,
  workspaceId: string,
  citationId: string,
  options: { allowDeleted?: boolean } = {},
): Promise<WorkspaceCitation> {
  const row = await WorkspaceCitationRepo.findById(db, ownerUserId, citationId);
  if (!row || row.workspaceId !== workspaceId || (!options.allowDeleted && row.deletedAt)) {
    throwAppError({
      message: "Referensi tidak ditemukan",
      code: "citation_not_found",
      status: 404,
    });
  }
  return row;
}

/** Guard duplikat untuk create tunggal (manual/DOI) — 409 kecuali `allowDuplicate`. */
async function assertNotDuplicate(
  db: DbOrTx,
  ownerUserId: string,
  workspaceId: string,
  canonicalKey: string,
  allowDuplicate: boolean,
): Promise<void> {
  if (allowDuplicate) return;
  const hits = await WorkspaceCitationRepo.findActiveByCanonicalKeys(db, ownerUserId, workspaceId, [
    canonicalKey,
  ]);
  const hit = hits[0];
  if (hit) {
    throwAppError({
      message: `Referensi serupa sudah ada: "${hit.title}"`,
      code: "citation_duplicate",
      status: 409,
      severity: "warning",
    });
  }
}

function rowFromCsl(input: {
  ownerUserId: string;
  workspaceId: string;
  source: CitationSource;
  csl: CslItem;
  tags: string[];
  now: number;
}): NewWorkspaceCitation {
  const columns = cslItemToColumns(input.csl);
  return {
    id: crypto.randomUUID(),
    ownerUserId: input.ownerUserId,
    workspaceId: input.workspaceId,
    artifactId: null,
    source: input.source,
    provider: null,
    externalId: null,
    documentType: columns.documentType,
    title: columns.title,
    authorsJson: columns.authors,
    publishedYear: columns.publishedYear,
    venue: columns.venue,
    publisher: columns.publisher,
    doi: columns.doi,
    url: columns.url,
    tags: normalizeTags(input.tags),
    cslJson: input.csl,
    canonicalKey: canonicalKeyForCsl(input.csl),
    metadataStatus: metadataStatusFor(input.source, columns),
    createdAt: input.now,
    updatedAt: input.now,
  };
}

/** Nama penuh provider ("Given Family" / "Family, Given") → CitationAuthor. */
function authorFromName(name: string): CitationAuthor {
  const trimmed = name.trim();
  if (!trimmed) return { literal: name };
  if (trimmed.includes(",")) {
    const [family, given] = trimmed.split(",", 2).map((s) => s.trim());
    if (family) return given ? { family, given } : { family };
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { literal: trimmed };
  const family = parts[parts.length - 1] as string;
  return { family, given: parts.slice(0, -1).join(" ") };
}

/**
 * CitationService — CRUD + dedupe + export + render Citation Library workspace
 * (Citation Manager Fase 1). Semua method mengasumsikan pemanggil route sudah
 * ter-autentikasi; otorisasi workspace ditegakkan di sini.
 */
export const CitationService = {
  async list(
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
  ): Promise<{ items: CitationListItem[]; nextCursor: string | null; total: number }> {
    await WorkspaceService.assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId);
    const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIST_LIMIT, 1), MAX_LIST_LIMIT);
    const [page, total] = await Promise.all([
      WorkspaceCitationRepo.listByWorkspace(db, {
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
      WorkspaceCitationRepo.countActive(db, input.ownerUserId, input.workspaceId),
    ]);
    return { items: page.items.map(toListItem), nextCursor: page.nextCursor, total };
  },

  async listTags(
    db: DbOrTx,
    input: { ownerUserId: string; workspaceId: string },
  ): Promise<string[]> {
    await WorkspaceService.assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId);
    return WorkspaceCitationRepo.listActiveTags(db, input.ownerUserId, input.workspaceId);
  },

  async get(
    db: DbOrTx,
    input: { ownerUserId: string; workspaceId: string; citationId: string },
  ): Promise<CitationDetail> {
    await WorkspaceService.assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId);
    const row = await requireCitation(db, input.ownerUserId, input.workspaceId, input.citationId, {
      allowDeleted: true,
    });
    return toDetail(row);
  },

  async createManual(
    db: DbOrTx,
    input: {
      ownerUserId: string;
      workspaceId: string;
      fields: ManualCitationInput;
      tags?: string[];
      allowDuplicate?: boolean;
    },
  ): Promise<CitationDetail> {
    await WorkspaceService.assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId, {
      requireActive: true,
    });
    if (!input.fields.title?.trim()) {
      throwAppError({
        message: "Judul wajib diisi",
        code: "citation_title_required",
        field: "title",
      });
    }
    const csl = buildCslFromManualInput(input.fields);
    const row = rowFromCsl({
      ownerUserId: input.ownerUserId,
      workspaceId: input.workspaceId,
      source: "manual",
      csl,
      tags: input.tags ?? [],
      now: Date.now(),
    });
    await assertNotDuplicate(
      db,
      input.ownerUserId,
      input.workspaceId,
      row.canonicalKey,
      input.allowDuplicate ?? false,
    );
    await WorkspaceCitationRepo.insert(db, row);
    return this.get(db, {
      ownerUserId: input.ownerUserId,
      workspaceId: input.workspaceId,
      citationId: row.id,
    });
  },

  async createByDoi(
    db: DbOrTx,
    input: {
      ownerUserId: string;
      workspaceId: string;
      doi: string;
      tags?: string[];
      allowDuplicate?: boolean;
    },
  ): Promise<CitationDetail> {
    await WorkspaceService.assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId, {
      requireActive: true,
    });
    const classified = classifyPaperText(input.doi) ?? {
      kind: "doi" as const,
      doi: normalizeDoi(input.doi),
      academicDomain: false,
      raw: input.doi,
    };
    if (!classified.doi && !classified.arxivId) {
      throwAppError({
        message: "DOI tidak valid",
        code: "citation_doi_invalid",
        field: "doi",
      });
    }
    const paper = await resolvePaper({ classified });
    if (!paper?.title) {
      throwAppError({
        message: "Metadata untuk DOI ini tidak ditemukan",
        code: "citation_doi_not_found",
        status: 404,
        severity: "warning",
      });
    }
    const csl: CslItem = {
      type: "article-journal",
      title: paper.title,
      author: paper.authors.map((a) => authorFromName(a.name)),
    };
    if (paper.publishedYear) csl.issued = { "date-parts": [[paper.publishedYear]] };
    if (paper.journal) csl["container-title"] = paper.journal;
    if (paper.publisher) csl.publisher = paper.publisher;
    if (paper.doi) csl.DOI = paper.doi;
    if (paper.landingPageUrl) csl.URL = paper.landingPageUrl;
    if (paper.abstract) csl.abstract = paper.abstract;

    const row = rowFromCsl({
      ownerUserId: input.ownerUserId,
      workspaceId: input.workspaceId,
      source: "doi",
      csl,
      tags: input.tags ?? [],
      now: Date.now(),
    });
    await assertNotDuplicate(
      db,
      input.ownerUserId,
      input.workspaceId,
      row.canonicalKey,
      input.allowDuplicate ?? false,
    );
    await WorkspaceCitationRepo.insert(db, row);
    return this.get(db, {
      ownerUserId: input.ownerUserId,
      workspaceId: input.workspaceId,
      citationId: row.id,
    });
  },

  async update(
    db: DbOrTx,
    input: {
      ownerUserId: string;
      workspaceId: string;
      citationId: string;
      fields?: ManualCitationInput;
      tags?: string[];
      artifactId?: string | null;
      markReviewed?: boolean;
    },
  ): Promise<CitationDetail> {
    await WorkspaceService.assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId);
    const row = await requireCitation(db, input.ownerUserId, input.workspaceId, input.citationId);
    const now = Date.now();
    const patch: Partial<NewWorkspaceCitation> = { updatedAt: now };

    if (input.fields) {
      if (!input.fields.title?.trim()) {
        throwAppError({
          message: "Judul wajib diisi",
          code: "citation_title_required",
          field: "title",
        });
      }
      // Edit metadata = rebuild CSL dari form (field kosong berarti dihapus user),
      // merge di atas csl existing supaya field non-form (abstract dll.) bertahan.
      const rebuilt = buildCslFromManualInput(input.fields);
      const existingCsl = (row.cslJson ?? {}) as Record<string, unknown>;
      const mergedCsl: CslItem = { ...existingCsl, ...rebuilt };
      // Field form yang dikosongkan harus benar-benar hilang dari CSL.
      for (const key of ["author", "issued", "container-title", "publisher", "DOI", "URL", "ISBN"]) {
        if (!(key in rebuilt)) delete mergedCsl[key];
      }
      const columns = cslItemToColumns(mergedCsl);
      patch.cslJson = mergedCsl;
      patch.documentType = columns.documentType;
      patch.title = columns.title;
      patch.authorsJson = columns.authors;
      patch.publishedYear = columns.publishedYear;
      patch.venue = columns.venue;
      patch.publisher = columns.publisher;
      patch.doi = columns.doi;
      patch.url = columns.url;
      patch.canonicalKey = canonicalKeyForCsl(mergedCsl);
      patch.metadataStatus = metadataStatusFor(row.source as CitationSource, columns);
    }
    if (input.tags !== undefined) patch.tags = normalizeTags(input.tags);
    if (input.artifactId !== undefined) patch.artifactId = input.artifactId;
    if (input.markReviewed) {
      patch.metadataStatus = "verified";
      patch.reviewedAt = now;
    }

    await WorkspaceCitationRepo.updateById(db, row.id, patch);
    return this.get(db, {
      ownerUserId: input.ownerUserId,
      workspaceId: input.workspaceId,
      citationId: row.id,
    });
  },

  async softDelete(
    db: DbOrTx,
    input: { ownerUserId: string; workspaceId: string; citationId: string },
  ): Promise<{ ok: true }> {
    await WorkspaceService.assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId);
    const row = await requireCitation(db, input.ownerUserId, input.workspaceId, input.citationId);
    await WorkspaceCitationRepo.updateById(db, row.id, {
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { ok: true };
  },

  /** Merge duplikat eksplisit: target dipertahankan + dilengkapi, source di-soft-delete. */
  async merge(
    db: Db,
    input: {
      ownerUserId: string;
      workspaceId: string;
      sourceId: string;
      targetId: string;
    },
  ): Promise<CitationDetail> {
    await WorkspaceService.assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId);
    if (input.sourceId === input.targetId) {
      throwAppError({
        message: "Referensi sumber dan target sama",
        code: "citation_merge_invalid",
      });
    }
    const now = Date.now();
    await db.transaction(async (tx) => {
      const source = await requireCitation(tx, input.ownerUserId, input.workspaceId, input.sourceId);
      const target = await requireCitation(tx, input.ownerUserId, input.workspaceId, input.targetId);
      const patch: Partial<NewWorkspaceCitation> = { updatedAt: now };
      if (target.publishedYear === null && source.publishedYear !== null) {
        patch.publishedYear = source.publishedYear;
      }
      if (!target.venue && source.venue) patch.venue = source.venue;
      if (!target.publisher && source.publisher) patch.publisher = source.publisher;
      if (!target.doi && source.doi) patch.doi = source.doi;
      if (!target.url && source.url) patch.url = source.url;
      if (target.authorsJson.length === 0 && source.authorsJson.length > 0) {
        patch.authorsJson = source.authorsJson;
      }
      const mergedTags = normalizeTags([...target.tags, ...source.tags]);
      if (mergedTags.length !== target.tags.length) patch.tags = mergedTags;
      const targetCsl = (target.cslJson ?? {}) as Record<string, unknown>;
      const sourceCsl = (source.cslJson ?? {}) as Record<string, unknown>;
      const mergedCsl = { ...targetCsl };
      let cslChanged = false;
      for (const [key, value] of Object.entries(sourceCsl)) {
        if (mergedCsl[key] === undefined && value !== undefined) {
          mergedCsl[key] = value;
          cslChanged = true;
        }
      }
      if (cslChanged) patch.cslJson = mergedCsl;
      await WorkspaceCitationRepo.updateById(tx, target.id, patch);
      await WorkspaceCitationRepo.updateById(tx, source.id, { deletedAt: now, updatedAt: now });
    });
    return this.get(db, {
      ownerUserId: input.ownerUserId,
      workspaceId: input.workspaceId,
      citationId: input.targetId,
    });
  },

  async export(
    db: DbOrTx,
    input: {
      ownerUserId: string;
      workspaceId: string;
      format: CitationExportFormat;
      citationIds?: string[];
    },
  ): Promise<{ content: string; mimeType: string; filename: string }> {
    await WorkspaceService.assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId);
    const rows = input.citationIds?.length
      ? (await WorkspaceCitationRepo.findByIds(db, input.ownerUserId, input.citationIds)).filter(
          (r) => r.workspaceId === input.workspaceId && !r.deletedAt,
        )
      : await WorkspaceCitationRepo.listAllActive(db, input.ownerUserId, input.workspaceId);
    if (rows.length === 0) {
      throwAppError({
        message: "Tidak ada referensi untuk diekspor",
        code: "citation_export_empty",
        severity: "info",
      });
    }
    const items = rows.map((r) => ({ ...(r.cslJson as CslItem), id: r.id }));
    const { content, mimeType, extension } = exportCitations(items, input.format);
    return { content, mimeType, filename: `sitasi.${extension}` };
  },

  /** Render preview per-citation + bibliography utuh pada style tertentu. */
  async render(
    db: DbOrTx,
    input: {
      ownerUserId: string;
      workspaceId: string;
      styleId?: string;
      citationIds?: string[];
    },
  ): Promise<{
    styleId: CitationStyleId;
    entries: Array<{ id: string; text: string }>;
    bibliography: string;
  }> {
    await WorkspaceService.assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId);
    const settings = await this.getSettings(db, {
      ownerUserId: input.ownerUserId,
      workspaceId: input.workspaceId,
    });
    const styleId =
      input.styleId && isCitationStyleId(input.styleId) ? input.styleId : settings.defaultStyleId;
    const rows = input.citationIds?.length
      ? (await WorkspaceCitationRepo.findByIds(db, input.ownerUserId, input.citationIds)).filter(
          (r) => r.workspaceId === input.workspaceId && !r.deletedAt,
        )
      : await WorkspaceCitationRepo.listAllActive(db, input.ownerUserId, input.workspaceId);
    const items = rows.map((r) => ({ ...(r.cslJson as CslItem), id: r.id }));
    return {
      styleId,
      entries: renderBibliographyEntries(items, styleId),
      bibliography: renderBibliography(items, styleId, settings.bibliographySort),
    };
  },

  async getSettings(
    db: DbOrTx,
    input: { ownerUserId: string; workspaceId: string },
  ): Promise<CitationSettingsView> {
    await WorkspaceService.assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId);
    const row = await WorkspaceCitationSettingsRepo.findByWorkspace(db, input.workspaceId);
    return {
      defaultStyleId: (row?.defaultStyleId as CitationStyleId | undefined) ?? DEFAULT_STYLE,
      bibliographySort: (row?.bibliographySort as BibliographySort | undefined) ?? DEFAULT_SORT,
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
    await WorkspaceService.assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId);
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
        ...(input.defaultStyleId ? { defaultStyleId: input.defaultStyleId } : {}),
        ...(input.bibliographySort ? { bibliographySort: input.bibliographySort } : {}),
      },
    );
    return this.getSettings(db, {
      ownerUserId: input.ownerUserId,
      workspaceId: input.workspaceId,
    });
  },
};

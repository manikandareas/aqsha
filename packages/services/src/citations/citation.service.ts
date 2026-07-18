import type {
  ArtifactPaperMetadata,
  BibliographySort,
  Citation,
  CitationAuthor,
  CitationMetadataStatus,
  CitationProvider,
  CitationSource,
  CitationStyleId,
  Db,
  DbOrTx,
  NewCitation,
} from "@aqsha/db";
import {
  ArtifactPaperMetadataRepo,
  CitationRepo,
  decodeKeysetCursor,
  DocumentCitationUsageRepo,
  throwAppError,
  WorkspaceCitationSettingsRepo,
} from "@aqsha/db";
import { classifyPaperText } from "../papers/identifiers";
import { resolvePaper, type ResolvedPaper } from "../papers/resolve";
import { WorkspaceService } from "../workspace.service";
import {
  type CitationExportFormat,
  type DocumentCluster,
  exportCitations,
  isCitationStyleId,
  renderBibliography,
  renderBibliographyEntries,
  renderDocumentCitations,
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
  /** Jumlah dokumen yang memakai citation ini (hanya diisi oleh `get`). */
  usageCount?: number;
};

export type CitationSettingsView = {
  defaultStyleId: CitationStyleId;
  bibliographySort: BibliographySort;
};

/** Hasil `createFromArtifact` — `created=false` bila artifact sudah tertaut / dedupe. */
export type CreateFromArtifactResult = {
  citation: CitationDetail;
  created: boolean;
  linkedExisting: boolean;
};

/** Grup kandidat duplikat (canonical key sama, ≥2 anggota aktif). */
export type CitationDuplicateGroup = {
  canonicalKey: string;
  members: CitationListItem[];
};

function toListItem(row: Citation): CitationListItem {
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

function toDetail(row: Citation): CitationDetail {
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
  citationId: string,
  options: { allowDeleted?: boolean } = {},
): Promise<Citation> {
  const row = await CitationRepo.findById(db, ownerUserId, citationId);
  if (!row || (!options.allowDeleted && row.deletedAt)) {
    throwAppError({
      message: "Referensi tidak ditemukan",
      code: "citation_not_found",
      status: 404,
    });
  }
  return row;
}

/** Duplikat aktif by canonical key milik owner; null bila tidak ada. */
async function findActiveDuplicate(
  db: DbOrTx,
  ownerUserId: string,
  canonicalKey: string,
): Promise<Citation | null> {
  const hits = await CitationRepo.findActiveByCanonicalKeys(db, ownerUserId, [canonicalKey]);
  return hits[0] ?? null;
}

function rowFromCsl(input: {
  ownerUserId: string;
  source: CitationSource;
  csl: CslItem;
  tags: string[];
  now: number;
  artifactId?: string | null;
  provider?: CitationProvider | null;
  externalId?: string | null;
}): NewCitation {
  const columns = cslItemToColumns(input.csl);
  return {
    id: crypto.randomUUID(),
    ownerUserId: input.ownerUserId,
    artifactId: input.artifactId ?? null,
    source: input.source,
    provider: input.provider ?? null,
    externalId: input.externalId ?? null,
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

/** Peta hasil resolver DOI/arXiv (`ResolvedPaper`) → CSL-JSON. Hanya field terisi. */
function buildCslFromResolvedPaper(paper: ResolvedPaper): CslItem {
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
  return csl;
}

/** Peta `artifact_paper_metadata` → CSL-JSON (artifact bridge). Hanya field terisi. */
function buildCslFromPaperMetadata(meta: ArtifactPaperMetadata): CslItem {
  const csl: CslItem = { type: "article-journal", title: meta.title ?? "" };
  const authors = (meta.authors ?? [])
    .map((a) => authorFromName(a.name))
    .filter((a) => a.literal || a.family || a.given);
  if (authors.length > 0) csl.author = authors;
  if (meta.publishedYear) csl.issued = { "date-parts": [[meta.publishedYear]] };
  if (meta.journal) csl["container-title"] = meta.journal;
  if (meta.publisher) csl.publisher = meta.publisher;
  if (meta.doi) csl.DOI = meta.doi;
  if (meta.sourceUrl) csl.URL = meta.sourceUrl;
  if (meta.abstract) csl.abstract = meta.abstract;
  return csl;
}

/** Skor kelengkapan metadata — dipakai memilih target default saat merge banyak. */
function completenessScore(row: Citation): number {
  let score = 0;
  if (row.doi) score += 3;
  if (row.authorsJson.length > 0) score += 2;
  if (row.publishedYear !== null) score += 1;
  if (row.venue) score += 1;
  if (row.publisher) score += 1;
  if (row.url) score += 1;
  if (row.metadataStatus === "verified") score += 2;
  score += row.tags.length; // referensi yang sudah dikurasi diutamakan
  return score;
}

/** Target merge default: paling lengkap; seri → yang lebih dulu dibuat (identitas stabil). */
function pickMergeTarget(rows: Citation[]): Citation {
  return rows.reduce((best, row) => {
    const a = completenessScore(row);
    const b = completenessScore(best);
    if (a > b) return row;
    if (a === b && row.createdAt < best.createdAt) return row;
    return best;
  });
}

/**
 * CitationService — CRUD + dedupe + export + render perpustakaan referensi akun.
 * Semua method mengasumsikan pemanggil route sudah ter-autentikasi; scoping =
 * ownerUserId. Yang tetap per proyek: `createFromArtifact` (artifact hidup di
 * workspace) dan settings/render (gaya sitasi per proyek).
 */
export const CitationService = {
  async list(
    db: DbOrTx,
    input: {
      ownerUserId: string;
      limit?: number;
      cursor?: string | null;
      q?: string;
      status?: CitationMetadataStatus;
      source?: CitationSource;
      tag?: string;
    },
  ): Promise<{ items: CitationListItem[]; nextCursor: string | null; total: number }> {
    const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIST_LIMIT, 1), MAX_LIST_LIMIT);
    const [page, total] = await Promise.all([
      CitationRepo.listByOwner(db, {
        ownerUserId: input.ownerUserId,
        limit,
        cursor: decodeKeysetCursor(input.cursor),
        filters: {
          q: input.q?.trim() || undefined,
          status: input.status,
          source: input.source,
          tag: input.tag,
        },
      }),
      CitationRepo.countActive(db, input.ownerUserId),
    ]);
    return { items: page.items.map(toListItem), nextCursor: page.nextCursor, total };
  },

  async listTags(db: DbOrTx, input: { ownerUserId: string }): Promise<string[]> {
    return CitationRepo.listActiveTags(db, input.ownerUserId);
  },

  async get(
    db: DbOrTx,
    input: { ownerUserId: string; citationId: string },
  ): Promise<CitationDetail> {
    const row = await requireCitation(db, input.ownerUserId, input.citationId, {
      allowDeleted: true,
    });
    const usageCount = await DocumentCitationUsageRepo.countDocumentsUsingCitation(
      db,
      input.ownerUserId,
      row.id,
    );
    return { ...toDetail(row), usageCount };
  },

  async createManual(
    db: DbOrTx,
    input: {
      ownerUserId: string;
      fields: ManualCitationInput;
      tags?: string[];
      allowDuplicate?: boolean;
      onDuplicate?: "return-existing";
    },
  ): Promise<CitationDetail & { created: boolean }> {
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
      source: "manual",
      csl,
      tags: input.tags ?? [],
      now: Date.now(),
    });
    if (!input.allowDuplicate) {
      const existing = await findActiveDuplicate(db, input.ownerUserId, row.canonicalKey);
      if (existing) {
        // "Simpan dari pencarian" tidak boleh membuat entri dobel — kembalikan
        // referensi existing sebagai hasil sukses alih-alih 409.
        if (input.onDuplicate === "return-existing") {
          const detail = await this.get(db, {
            ownerUserId: input.ownerUserId,
            citationId: existing.id,
          });
          return { ...detail, created: false };
        }
        throwAppError({
          message: `Referensi serupa sudah ada: "${existing.title}"`,
          code: "citation_duplicate",
          status: 409,
          severity: "warning",
        });
      }
    }
    await CitationRepo.insert(db, row);
    const detail = await this.get(db, { ownerUserId: input.ownerUserId, citationId: row.id });
    return { ...detail, created: true };
  },

  async createByDoi(
    db: DbOrTx,
    input: {
      ownerUserId: string;
      doi: string;
      tags?: string[];
      allowDuplicate?: boolean;
      onDuplicate?: "return-existing";
    },
  ): Promise<CitationDetail & { created: boolean }> {
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
    const csl = buildCslFromResolvedPaper(paper);

    const row = rowFromCsl({
      ownerUserId: input.ownerUserId,
      source: "doi",
      csl,
      tags: input.tags ?? [],
      now: Date.now(),
    });
    if (!input.allowDuplicate) {
      const existing = await findActiveDuplicate(db, input.ownerUserId, row.canonicalKey);
      if (existing) {
        // "Simpan dari pencarian" tidak boleh membuat entri dobel — kembalikan
        // referensi existing sebagai hasil sukses alih-alih 409.
        if (input.onDuplicate === "return-existing") {
          const detail = await this.get(db, {
            ownerUserId: input.ownerUserId,
            citationId: existing.id,
          });
          return { ...detail, created: false };
        }
        throwAppError({
          message: `Referensi serupa sudah ada: "${existing.title}"`,
          code: "citation_duplicate",
          status: 409,
          severity: "warning",
        });
      }
    }
    await CitationRepo.insert(db, row);
    const detail = await this.get(db, { ownerUserId: input.ownerUserId, citationId: row.id });
    return { ...detail, created: true };
  },

  /**
   * Buat citation dari artifact paper (artifact bridge). Baca `artifact_paper_metadata`
   * (owner-scoped + membawa `workspace_id` artifact) — tanpa memindahkan file; hasil
   * citation masuk perpustakaan akun. Idempotent: artifact yang sudah tertaut /
   * duplikat canonical key tidak menggandakan; row duplikat tanpa tautan artifact
   * "diadopsi" (di-set `artifact_id`).
   */
  async createFromArtifact(
    db: DbOrTx,
    input: {
      ownerUserId: string;
      workspaceId: string;
      artifactId: string;
      tags?: string[];
    },
  ): Promise<CreateFromArtifactResult> {
    await WorkspaceService.assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId, {
      requireActive: true,
    });
    const meta = await ArtifactPaperMetadataRepo.findByArtifact(
      db,
      input.ownerUserId,
      input.artifactId,
    );
    if (!meta || meta.workspaceId !== input.workspaceId) {
      throwAppError({
        message: "Artifact ini belum punya metadata paper di workspace ini",
        code: "citation_artifact_no_metadata",
        status: 404,
        severity: "warning",
      });
    }
    if (!meta.title?.trim()) {
      throwAppError({
        message: "Metadata paper belum punya judul untuk disitasi",
        code: "citation_artifact_no_metadata",
        status: 404,
        severity: "warning",
      });
    }
    // Idempotent: artifact sudah tertaut citation aktif → kembalikan yang ada.
    const linked = await CitationRepo.findActiveByArtifact(db, input.ownerUserId, input.artifactId);
    if (linked) {
      return { citation: toDetail(linked), created: false, linkedExisting: true };
    }
    const csl = buildCslFromPaperMetadata(meta);
    const row = rowFromCsl({
      ownerUserId: input.ownerUserId,
      source: "artifact",
      csl,
      tags: input.tags ?? [],
      now: Date.now(),
      artifactId: input.artifactId,
    });
    // Dedupe: referensi serupa sudah ada → adopsi (tautkan) bila belum punya artifact.
    const dupes = await CitationRepo.findActiveByCanonicalKeys(db, input.ownerUserId, [
      row.canonicalKey,
    ]);
    const match = dupes[0];
    if (match) {
      if (!match.artifactId) {
        await CitationRepo.updateById(db, match.id, {
          artifactId: input.artifactId,
          updatedAt: Date.now(),
        });
        return {
          citation: await this.get(db, { ownerUserId: input.ownerUserId, citationId: match.id }),
          created: false,
          linkedExisting: true,
        };
      }
      return { citation: toDetail(match), created: false, linkedExisting: true };
    }
    await CitationRepo.insert(db, row);
    return {
      citation: await this.get(db, { ownerUserId: input.ownerUserId, citationId: row.id }),
      created: true,
      linkedExisting: false,
    };
  },

  /**
   * Perbarui metadata citation dari DOI-nya (quality workflow). Re-resolve
   * lalu isi HANYA field yang kosong (jangan clobber edit user); status → verified.
   */
  async resolveFromDoi(
    db: DbOrTx,
    input: { ownerUserId: string; citationId: string },
  ): Promise<CitationDetail> {
    const row = await requireCitation(db, input.ownerUserId, input.citationId);
    const doi = row.doi;
    if (!doi) {
      throwAppError({
        message: "Referensi ini tidak punya DOI untuk diperbarui",
        code: "citation_resolve_no_doi",
        severity: "warning",
        field: "doi",
      });
    }
    const classified = classifyPaperText(doi) ?? {
      kind: "doi" as const,
      doi: normalizeDoi(doi),
      academicDomain: false,
      raw: doi,
    };
    const paper = await resolvePaper({ classified });
    if (!paper?.title) {
      throwAppError({
        message: "Metadata untuk DOI ini tidak ditemukan",
        code: "citation_doi_not_found",
        status: 404,
        severity: "warning",
      });
    }
    const incoming = buildCslFromResolvedPaper(paper);
    const mergedCsl = { ...((row.cslJson ?? {}) as Record<string, unknown>) };
    for (const [key, value] of Object.entries(incoming)) {
      if (mergedCsl[key] === undefined && value !== undefined) mergedCsl[key] = value;
    }
    const columns = cslItemToColumns(mergedCsl);
    const now = Date.now();
    await CitationRepo.updateById(db, row.id, {
      cslJson: mergedCsl,
      documentType: columns.documentType,
      title: columns.title,
      authorsJson: columns.authors,
      publishedYear: columns.publishedYear,
      venue: columns.venue,
      publisher: columns.publisher,
      doi: columns.doi,
      url: columns.url,
      canonicalKey: canonicalKeyForCsl(mergedCsl),
      metadataStatus: "verified",
      reviewedAt: now,
      updatedAt: now,
    });
    return this.get(db, { ownerUserId: input.ownerUserId, citationId: row.id });
  },

  async update(
    db: DbOrTx,
    input: {
      ownerUserId: string;
      citationId: string;
      fields?: ManualCitationInput;
      tags?: string[];
      artifactId?: string | null;
      markReviewed?: boolean;
    },
  ): Promise<CitationDetail> {
    const row = await requireCitation(db, input.ownerUserId, input.citationId);
    const now = Date.now();
    const patch: Partial<NewCitation> = { updatedAt: now };

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

    await CitationRepo.updateById(db, row.id, patch);
    return this.get(db, { ownerUserId: input.ownerUserId, citationId: row.id });
  },

  async softDelete(
    db: DbOrTx,
    input: { ownerUserId: string; citationId: string },
  ): Promise<{ ok: true }> {
    const row = await requireCitation(db, input.ownerUserId, input.citationId);
    await CitationRepo.updateById(db, row.id, {
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
      sourceId: string;
      targetId: string;
    },
  ): Promise<CitationDetail> {
    if (input.sourceId === input.targetId) {
      throwAppError({
        message: "Referensi sumber dan target sama",
        code: "citation_merge_invalid",
      });
    }
    const now = Date.now();
    await db.transaction(async (tx) => {
      const source = await requireCitation(tx, input.ownerUserId, input.sourceId);
      const target = await requireCitation(tx, input.ownerUserId, input.targetId);
      const patch: Partial<NewCitation> = { updatedAt: now };
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
      await CitationRepo.updateById(tx, target.id, patch);
      await CitationRepo.updateById(tx, source.id, { deletedAt: now, updatedAt: now });
    });
    return this.get(db, { ownerUserId: input.ownerUserId, citationId: input.targetId });
  },

  /** Grup kandidat duplikat (canonical key sama, ≥2 anggota) — untuk "Kelola duplikat". */
  async listDuplicateGroups(
    db: DbOrTx,
    input: { ownerUserId: string },
  ): Promise<CitationDuplicateGroup[]> {
    const rows = await CitationRepo.listAllActive(db, input.ownerUserId);
    const byKey = new Map<string, Citation[]>();
    for (const row of rows) {
      const bucket = byKey.get(row.canonicalKey);
      if (bucket) bucket.push(row);
      else byKey.set(row.canonicalKey, [row]);
    }
    const groups: CitationDuplicateGroup[] = [];
    for (const [canonicalKey, members] of byKey) {
      if (members.length > 1) {
        groups.push({ canonicalKey, members: members.map(toListItem) });
      }
    }
    return groups.sort((a, b) => b.members.length - a.members.length);
  },

  /**
   * Merge banyak citation (bulk bar / kelola duplikat) dalam satu transaksi: target
   * (paling lengkap, atau `targetId` eksplisit) dilengkapi dari field kosong tiap
   * source, tag di-union, source di-soft-delete. Pola sama dengan `merge` pairwise.
   */
  async mergeMany(
    db: Db,
    input: {
      ownerUserId: string;
      ids: string[];
      targetId?: string;
    },
  ): Promise<CitationDetail> {
    const uniqueIds = [...new Set(input.ids)];
    if (uniqueIds.length < 2) {
      throwAppError({
        message: "Pilih minimal dua referensi untuk digabungkan",
        code: "citation_merge_invalid",
      });
    }
    const now = Date.now();
    let resolvedTargetId = "";
    await db.transaction(async (tx) => {
      const rows = await CitationRepo.findByIds(tx, input.ownerUserId, uniqueIds);
      const active = rows.filter((r) => !r.deletedAt);
      if (active.length < 2) {
        throwAppError({
          message: "Referensi untuk digabungkan tidak ditemukan",
          code: "citation_merge_invalid",
          status: 404,
        });
      }
      const target = input.targetId
        ? active.find((r) => r.id === input.targetId)
        : pickMergeTarget(active);
      if (!target) {
        throwAppError({
          message: "Target gabungan tidak ditemukan",
          code: "citation_merge_invalid",
          status: 404,
        });
      }
      resolvedTargetId = target.id;
      const sources = active.filter((r) => r.id !== target.id);

      // Akumulasi fill-missing dari semua source (urut) + union tag + merge CSL.
      let publishedYear = target.publishedYear;
      let venue = target.venue;
      let publisher = target.publisher;
      let doi = target.doi;
      let url = target.url;
      let authorsJson = target.authorsJson;
      const mergedCsl = { ...((target.cslJson ?? {}) as Record<string, unknown>) };
      const tagBuckets: string[][] = [target.tags];
      for (const source of sources) {
        if (publishedYear === null && source.publishedYear !== null) {
          publishedYear = source.publishedYear;
        }
        if (!venue && source.venue) venue = source.venue;
        if (!publisher && source.publisher) publisher = source.publisher;
        if (!doi && source.doi) doi = source.doi;
        if (!url && source.url) url = source.url;
        if (authorsJson.length === 0 && source.authorsJson.length > 0) {
          authorsJson = source.authorsJson;
        }
        const sourceCsl = (source.cslJson ?? {}) as Record<string, unknown>;
        for (const [key, value] of Object.entries(sourceCsl)) {
          if (mergedCsl[key] === undefined && value !== undefined) mergedCsl[key] = value;
        }
        tagBuckets.push(source.tags);
      }
      await CitationRepo.updateById(tx, target.id, {
        publishedYear,
        venue,
        publisher,
        doi,
        url,
        authorsJson,
        cslJson: mergedCsl,
        tags: normalizeTags(tagBuckets.flat()),
        updatedAt: now,
      });
      for (const source of sources) {
        await CitationRepo.updateById(tx, source.id, { deletedAt: now, updatedAt: now });
      }
    });
    return this.get(db, { ownerUserId: input.ownerUserId, citationId: resolvedTargetId });
  },

  /** Tambah tag ke banyak citation sekaligus (bulk bar). Union per-baris, cap normal. */
  async bulkAddTag(
    db: Db,
    input: { ownerUserId: string; ids: string[]; tags: string[] },
  ): Promise<{ affected: number }> {
    const addTags = normalizeTags(input.tags);
    const uniqueIds = [...new Set(input.ids)];
    if (addTags.length === 0 || uniqueIds.length === 0) return { affected: 0 };
    const now = Date.now();
    let affected = 0;
    await db.transaction(async (tx) => {
      const rows = (await CitationRepo.findByIds(tx, input.ownerUserId, uniqueIds)).filter(
        (r) => !r.deletedAt,
      );
      for (const row of rows) {
        const merged = normalizeTags([...row.tags, ...addTags]);
        if (merged.length !== row.tags.length) {
          await CitationRepo.updateById(tx, row.id, { tags: merged, updatedAt: now });
          affected++;
        }
      }
    });
    return { affected };
  },

  /** Soft delete banyak citation (bulk bar). Guard owner+aktif di repo. */
  async bulkSoftDelete(
    db: DbOrTx,
    input: { ownerUserId: string; ids: string[] },
  ): Promise<{ affected: number }> {
    const uniqueIds = [...new Set(input.ids)];
    if (uniqueIds.length === 0) return { affected: 0 };
    const affected = await CitationRepo.softDeleteMany(db, input.ownerUserId, uniqueIds, Date.now());
    return { affected };
  },

  async export(
    db: DbOrTx,
    input: {
      ownerUserId: string;
      format: CitationExportFormat;
      citationIds?: string[];
    },
  ): Promise<{ content: string; mimeType: string; filename: string }> {
    const rows = input.citationIds?.length
      ? (await CitationRepo.findByIds(db, input.ownerUserId, input.citationIds)).filter(
          (r) => !r.deletedAt,
        )
      : await CitationRepo.listAllActive(db, input.ownerUserId);
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
      input.styleId && isCitationStyleId(input.styleId) ? input.styleId : settings.defaultStyleId;
    const rows = input.citationIds?.length
      ? (await CitationRepo.findByIds(db, input.ownerUserId, input.citationIds)).filter(
          (r) => !r.deletedAt,
        )
      : await CitationRepo.listAllActive(db, input.ownerUserId);
    const items = rows.map((r) => ({ ...(r.cslJson as CslItem), id: r.id }));
    return {
      styleId,
      entries: renderBibliographyEntries(items, styleId),
      bibliography: renderBibliography(items, styleId, settings.bibliographySort),
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
  ): Promise<{ styleId: CitationStyleId; entries: Array<{ id: string; text: string }> }> {
    await WorkspaceService.assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId);
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
      return { styleId: settings.defaultStyleId as CitationStyleId, entries: [] };
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
      input.styleId && isCitationStyleId(input.styleId) ? input.styleId : settings.defaultStyleId;

    const referencedIds = [...new Set(input.clusters.flatMap((c) => c.citationIds))];
    const rows = referencedIds.length
      ? (await CitationRepo.findByIds(db, input.ownerUserId, referencedIds)).filter(
          (r) => !r.deletedAt,
        )
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
          if (idx === 0 && (cluster.locator || cluster.prefix || cluster.suffix)) {
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
    return { styleId, clusters: rendered.clusters, bibliography: rendered.bibliography, missingIds };
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

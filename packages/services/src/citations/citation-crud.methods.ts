import type {
  Citation,
  CitationMetadataStatus,
  CitationSource,
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
} from "@aqsha/db";
import { classifyPaperText } from "../papers/identifiers";
import { resolvePaper } from "../papers/resolve";
import { WorkspaceService } from "../workspace.service";
import {
  composeBibliography,
  proposeBibKeys,
  type BibliographyExport,
} from "./citation-bib";
import { exportCitations, type CitationExportFormat } from "./citation-format";
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
import {
  buildCslFromPaperMetadata,
  buildCslFromResolvedPaper,
  type CitationDetail,
  type CitationDuplicateGroup,
  type CitationListItem,
  type CreateFromArtifactResult,
  DEFAULT_LIST_LIMIT,
  findActiveDuplicate,
  MAX_LIST_LIMIT,
  pickMergeTarget,
  requireCitation,
  rowFromCsl,
  toDetail,
  toListItem,
} from "./citation-model";

export const citationCrudMethods = {
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
  ): Promise<{
    items: CitationListItem[];
    nextCursor: string | null;
    total: number;
  }> {
    const limit = Math.min(
      Math.max(input.limit ?? DEFAULT_LIST_LIMIT, 1),
      MAX_LIST_LIMIT,
    );
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
    return {
      items: page.items.map(toListItem),
      nextCursor: page.nextCursor,
      total,
    };
  },

  async listTags(
    db: DbOrTx,
    input: { ownerUserId: string },
  ): Promise<string[]> {
    return CitationRepo.listActiveTags(db, input.ownerUserId);
  },

  async get(
    db: DbOrTx,
    input: { ownerUserId: string; citationId: string },
  ): Promise<CitationDetail> {
    const row = await requireCitation(db, input.ownerUserId, input.citationId, {
      allowDeleted: true,
    });
    const usageCount =
      await DocumentCitationUsageRepo.countDocumentsUsingCitation(
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
      const existing = await findActiveDuplicate(
        db,
        input.ownerUserId,
        row.canonicalKey,
      );
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
    const detail = await this.get(db, {
      ownerUserId: input.ownerUserId,
      citationId: row.id,
    });
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
      const existing = await findActiveDuplicate(
        db,
        input.ownerUserId,
        row.canonicalKey,
      );
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
    const detail = await this.get(db, {
      ownerUserId: input.ownerUserId,
      citationId: row.id,
    });
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
    await WorkspaceService.assertWorkspaceOwner(
      db,
      input.ownerUserId,
      input.workspaceId,
      {
        requireActive: true,
      },
    );
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
    const linked = await CitationRepo.findActiveByArtifact(
      db,
      input.ownerUserId,
      input.artifactId,
    );
    if (linked) {
      return {
        citation: toDetail(linked),
        created: false,
        linkedExisting: true,
      };
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
    const dupes = await CitationRepo.findActiveByCanonicalKeys(
      db,
      input.ownerUserId,
      [row.canonicalKey],
    );
    const match = dupes[0];
    if (match) {
      if (!match.artifactId) {
        await CitationRepo.updateById(db, match.id, {
          artifactId: input.artifactId,
          updatedAt: Date.now(),
        });
        return {
          citation: await this.get(db, {
            ownerUserId: input.ownerUserId,
            citationId: match.id,
          }),
          created: false,
          linkedExisting: true,
        };
      }
      return {
        citation: toDetail(match),
        created: false,
        linkedExisting: true,
      };
    }
    await CitationRepo.insert(db, row);
    return {
      citation: await this.get(db, {
        ownerUserId: input.ownerUserId,
        citationId: row.id,
      }),
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
      if (mergedCsl[key] === undefined && value !== undefined)
        mergedCsl[key] = value;
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
      for (const key of [
        "author",
        "issued",
        "container-title",
        "publisher",
        "DOI",
        "URL",
        "ISBN",
      ]) {
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
      patch.metadataStatus = metadataStatusFor(
        row.source as CitationSource,
        columns,
      );
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
      const source = await requireCitation(
        tx,
        input.ownerUserId,
        input.sourceId,
      );
      const target = await requireCitation(
        tx,
        input.ownerUserId,
        input.targetId,
      );
      const patch: Partial<NewCitation> = { updatedAt: now };
      if (target.publishedYear === null && source.publishedYear !== null) {
        patch.publishedYear = source.publishedYear;
      }
      if (!target.venue && source.venue) patch.venue = source.venue;
      if (!target.publisher && source.publisher)
        patch.publisher = source.publisher;
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
      await CitationRepo.updateById(tx, source.id, {
        deletedAt: now,
        updatedAt: now,
      });
    });
    return this.get(db, {
      ownerUserId: input.ownerUserId,
      citationId: input.targetId,
    });
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
      const rows = await CitationRepo.findByIds(
        tx,
        input.ownerUserId,
        uniqueIds,
      );
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
      const mergedCsl = {
        ...((target.cslJson ?? {}) as Record<string, unknown>),
      };
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
          if (mergedCsl[key] === undefined && value !== undefined)
            mergedCsl[key] = value;
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
        await CitationRepo.updateById(tx, source.id, {
          deletedAt: now,
          updatedAt: now,
        });
      }
    });
    return this.get(db, {
      ownerUserId: input.ownerUserId,
      citationId: resolvedTargetId,
    });
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
      const rows = (
        await CitationRepo.findByIds(tx, input.ownerUserId, uniqueIds)
      ).filter((r) => !r.deletedAt);
      for (const row of rows) {
        const merged = normalizeTags([...row.tags, ...addTags]);
        if (merged.length !== row.tags.length) {
          await CitationRepo.updateById(tx, row.id, {
            tags: merged,
            updatedAt: now,
          });
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
    const affected = await CitationRepo.softDeleteMany(
      db,
      input.ownerUserId,
      uniqueIds,
      Date.now(),
    );
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
      ? (
          await CitationRepo.findByIds(db, input.ownerUserId, input.citationIds)
        ).filter((r) => !r.deletedAt)
      : await CitationRepo.listAllActive(db, input.ownerUserId);
    if (rows.length === 0) {
      throwAppError({
        message: "Tidak ada referensi untuk diekspor",
        code: "citation_export_empty",
        severity: "info",
      });
    }
    const items = rows.map((r) => ({ ...(r.cslJson as CslItem), id: r.id }));
    const { content, mimeType, extension } = exportCitations(
      items,
      input.format,
    );
    return { content, mimeType, filename: `sitasi.${extension}` };
  },

  /**
   * .bib (biblatex) dari perpustakaan + peta id→kunci \cite{}. Himpunan kosong
   * sah (dokumen tanpa sitasi tetap harus bisa compile) — beda dengan `export`
   * yang menolak ekspor kosong.
   */
  async exportBib(
    db: DbOrTx,
    input: { ownerUserId: string; citationIds?: string[] },
  ): Promise<BibliographyExport> {
    const rows = input.citationIds?.length
      ? (
          await CitationRepo.findByIds(db, input.ownerUserId, input.citationIds)
        ).filter((r) => !r.deletedAt)
      : await CitationRepo.listAllActive(db, input.ownerUserId);
    const keyById = await this.ensureBibKeys(db, {
      ownerUserId: input.ownerUserId,
      citationIds: rows.map((r) => r.id),
    });
    const bib = composeBibliography(
      rows.map((r) => ({ key: keyById[r.id]!, csl: r.cslJson as CslItem })),
    );
    return { bib, keyById };
  },

  /**
   * Pastikan tiap citation punya bib_key persisten; kembalikan peta id→kunci.
   * Kunci di-assign SEKALI lalu beku — \cite{} yang tertanam di sumber tak boleh
   * bergeser. Race assign paralel ditangkap unique index → refresh taken + retry.
   */
  async ensureBibKeys(
    db: DbOrTx,
    input: { ownerUserId: string; citationIds: string[] },
  ): Promise<Record<string, string>> {
    const rows = await CitationRepo.findByIds(
      db,
      input.ownerUserId,
      input.citationIds,
    );
    const keyById: Record<string, string> = {};
    const missing: typeof rows = [];
    for (const row of rows) {
      if (row.bibKey) keyById[row.id] = row.bibKey;
      else missing.push(row);
    }
    if (missing.length === 0) return keyById;

    const taken = new Set(
      await CitationRepo.listTakenBibKeys(db, input.ownerUserId),
    );
    const proposed = proposeBibKeys(
      missing.map((r) => ({ id: r.id, csl: r.cslJson as CslItem })),
      taken,
    );
    const now = Date.now();
    for (const row of missing) {
      let key = proposed[row.id]!;
      for (let attempt = 0; ; attempt++) {
        try {
          await CitationRepo.updateById(db, row.id, {
            bibKey: key,
            updatedAt: now,
          });
          break;
        } catch (err) {
          if ((err as { code?: string }).code !== "23505" || attempt >= 3)
            throw err;
          const fresh = new Set(
            await CitationRepo.listTakenBibKeys(db, input.ownerUserId),
          );
          key = proposeBibKeys(
            [{ id: row.id, csl: row.cslJson as CslItem }],
            fresh,
          )[row.id]!;
        }
      }
      keyById[row.id] = key;
    }
    return keyById;
  },
};

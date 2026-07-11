import type {
  CitationAuthor,
  CitationMetadataStatus,
  CitationProvider,
  Db,
  DbOrTx,
  ImportBatchFormat,
  ImportBatchSourceKind,
  NewWorkspaceCitation,
  WorkspaceCitation,
} from "@aqsha/db";
import { CitationImportBatchRepo, throwAppError, WorkspaceCitationRepo } from "@aqsha/db";
import { WorkspaceService } from "../workspace.service";
import {
  canonicalKeyForCsl,
  type CitationColumns,
  cslItemToColumns,
  type CslItem,
  metadataIssuesFor,
  metadataStatusFor,
} from "./citation-normalize";
import {
  type BibliographyParseError,
  parseBibliographyFile,
  sniffBibliographyFormat,
} from "./citation-parse";

export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORT_RECORDS = 5000;

export type ImportDuplicatePolicy = "skip" | "merge" | "import";

/** Entry mentah yang siap di-stage (dari file parse ATAU provider sync). */
export type StagedEntryInput = { csl: CslItem; externalId?: string | null };

/** Record staging yang dipersist di `citation_import_batches.records_json`. */
type StagedImportRecord = {
  index: number;
  csl: CslItem;
  columns: CitationColumns;
  canonicalKey: string;
  metadataStatus: CitationMetadataStatus;
  issues: string[];
  /** Id citation existing yang cocok canonical key saat preview (kandidat duplikat). */
  duplicateOfId: string | null;
  duplicateOfTitle: string | null;
  /** True bila duplikat terhadap record lain DI DALAM batch yang sama. */
  duplicateInBatch: boolean;
  /** Provider item id — hanya terisi untuk batch `provider_sync` (idempotensi). */
  externalId: string | null;
};

export type ImportPreviewRecord = {
  index: number;
  title: string;
  authors: CitationAuthor[];
  publishedYear: number | null;
  venue: string | null;
  doi: string | null;
  documentType: string;
  metadataStatus: CitationMetadataStatus;
  issues: string[];
  duplicateOfId: string | null;
  duplicateOfTitle: string | null;
  duplicateInBatch: boolean;
};

export type ImportPreviewResult = {
  batchId: string;
  /** `null` untuk batch provider sync (bukan bibtex/ris). */
  format: ImportBatchFormat | null;
  counts: { total: number; valid: number; incomplete: number; duplicate: number; error: number };
  records: ImportPreviewRecord[];
  errors: Array<{ index: number; message: string; raw: string }>;
};

export type ImportCommitResult = {
  created: number;
  merged: number;
  skipped: number;
};

function toPreviewRecord(record: StagedImportRecord): ImportPreviewRecord {
  return {
    index: record.index,
    title: record.columns.title,
    authors: record.columns.authors,
    publishedYear: record.columns.publishedYear,
    venue: record.columns.venue,
    doi: record.columns.doi,
    documentType: record.columns.documentType,
    metadataStatus: record.metadataStatus,
    issues: record.issues,
    duplicateOfId: record.duplicateOfId,
    duplicateOfTitle: record.duplicateOfTitle,
    duplicateInBatch: record.duplicateInBatch,
  };
}

/** Patch field target yang kosong dari kolom record baru (policy `merge`). */
function missingFieldPatch(
  existing: {
    publishedYear: number | null;
    venue: string | null;
    publisher: string | null;
    doi: string | null;
    url: string | null;
    authorsJson: CitationAuthor[];
    cslJson: unknown;
  },
  incoming: { columns: CitationColumns; csl: CslItem },
): Partial<NewWorkspaceCitation> {
  const patch: Partial<NewWorkspaceCitation> = {};
  if (existing.publishedYear === null && incoming.columns.publishedYear !== null) {
    patch.publishedYear = incoming.columns.publishedYear;
  }
  if (!existing.venue && incoming.columns.venue) patch.venue = incoming.columns.venue;
  if (!existing.publisher && incoming.columns.publisher) {
    patch.publisher = incoming.columns.publisher;
  }
  if (!existing.doi && incoming.columns.doi) patch.doi = incoming.columns.doi;
  if (!existing.url && incoming.columns.url) patch.url = incoming.columns.url;
  if (existing.authorsJson.length === 0 && incoming.columns.authors.length > 0) {
    patch.authorsJson = incoming.columns.authors;
  }
  const existingCsl = (existing.cslJson ?? {}) as Record<string, unknown>;
  const mergedCsl: Record<string, unknown> = { ...existingCsl };
  let cslChanged = false;
  for (const [key, value] of Object.entries(incoming.csl)) {
    if (mergedCsl[key] === undefined && value !== undefined) {
      mergedCsl[key] = value;
      cslChanged = true;
    }
  }
  if (cslChanged) patch.cslJson = mergedCsl;
  return patch;
}

/**
 * Stage entry hasil parse/pull → tandai duplikat (canonical key + externalId untuk
 * provider) → simpan batch `pending`. Dipakai import file DAN provider sync (Fase 5–6):
 * satu pipeline preview→commit. `commit` membaca `sourceKind`/`provider` batch untuk
 * memutuskan `source` row.
 */
export async function stageImportBatch(
  db: DbOrTx,
  input: {
    ownerUserId: string;
    workspaceId: string;
    entries: StagedEntryInput[];
    parseErrors?: BibliographyParseError[];
    source: "import" | "provider_sync";
    sourceKind: ImportBatchSourceKind;
    format: ImportBatchFormat | null;
    provider?: CitationProvider | null;
    originalFilename?: string | null;
  },
): Promise<ImportPreviewResult> {
  if (input.entries.length > MAX_IMPORT_RECORDS) {
    throwAppError({
      message: `Batch melebihi batas ${MAX_IMPORT_RECORDS} record`,
      code: "citation_import_too_large",
      status: 413,
    });
  }
  const rawErrors = input.parseErrors ?? [];

  const staged: StagedImportRecord[] = input.entries.map((entry, i) => {
    const columns = cslItemToColumns(entry.csl);
    return {
      index: i,
      csl: entry.csl,
      columns,
      canonicalKey: canonicalKeyForCsl(entry.csl),
      metadataStatus: metadataStatusFor(input.source, columns),
      issues: metadataIssuesFor(columns),
      duplicateOfId: null,
      duplicateOfTitle: null,
      duplicateInBatch: false,
      externalId: entry.externalId ?? null,
    };
  });

  // Entry tanpa judul tidak bisa jadi row (title NOT NULL) → geser ke errors.
  const parseErrors = [...rawErrors];
  const usable: StagedImportRecord[] = [];
  for (const record of staged) {
    if (!record.columns.title) {
      parseErrors.push({
        index: record.index,
        message: "entry tanpa judul — tidak bisa diimpor",
        raw: JSON.stringify(record.csl).slice(0, 200),
      });
    } else {
      usable.push(record);
    }
  }

  // Kandidat duplikat: vs library existing (canonical key + provider externalId) + antar-record.
  const existing = await WorkspaceCitationRepo.findActiveByCanonicalKeys(
    db,
    input.ownerUserId,
    input.workspaceId,
    usable.map((r) => r.canonicalKey),
  );
  const existingByKey = new Map(existing.map((c) => [c.canonicalKey, c]));
  const existingByExternal = new Map<string, WorkspaceCitation>();
  if (input.provider) {
    const externalIds = usable
      .map((r) => r.externalId)
      .filter((v): v is string => Boolean(v));
    const existingExternal = await WorkspaceCitationRepo.findActiveByExternalIds(
      db,
      input.ownerUserId,
      input.workspaceId,
      input.provider,
      externalIds,
    );
    for (const c of existingExternal) {
      if (c.externalId) existingByExternal.set(c.externalId, c);
    }
  }
  const seenInBatch = new Set<string>();
  for (const record of usable) {
    const match =
      (record.externalId ? existingByExternal.get(record.externalId) : undefined) ??
      existingByKey.get(record.canonicalKey);
    if (match) {
      record.duplicateOfId = match.id;
      record.duplicateOfTitle = match.title;
    }
    if (seenInBatch.has(record.canonicalKey)) record.duplicateInBatch = true;
    else seenInBatch.add(record.canonicalKey);
  }

  const now = Date.now();
  const batchId = crypto.randomUUID();
  const counts = {
    total: staged.length + rawErrors.length,
    valid: usable.filter((r) => !r.duplicateOfId && !r.duplicateInBatch).length,
    incomplete: usable.filter((r) => r.metadataStatus === "incomplete").length,
    duplicate: usable.filter((r) => r.duplicateOfId || r.duplicateInBatch).length,
    error: parseErrors.length,
  };
  await CitationImportBatchRepo.insert(db, {
    id: batchId,
    ownerUserId: input.ownerUserId,
    workspaceId: input.workspaceId,
    sourceKind: input.sourceKind,
    format: input.format,
    provider: input.provider ?? null,
    originalFilename: input.originalFilename?.slice(0, 200) ?? null,
    totalCount: counts.total,
    validCount: counts.valid,
    duplicateCount: counts.duplicate,
    errorCount: counts.error,
    recordsJson: usable,
    createdAt: now,
    updatedAt: now,
  });

  return {
    batchId,
    format: input.format,
    counts,
    records: usable.map(toPreviewRecord),
    errors: parseErrors,
  };
}

/**
 * Import `.bib`/`.ris` dua langkah: `preview` mem-parse + menandai duplikat dan
 * MENAHAN record di batch row; `commit` menulis pilihan user ke library dalam satu
 * transaksi. Satu pipeline yang sama dipakai provider sync (Fase 5–6) via `stageImportBatch`.
 */
export const CitationImportService = {
  async preview(
    db: DbOrTx,
    input: {
      ownerUserId: string;
      workspaceId: string;
      fileName: string;
      content: string;
    },
  ): Promise<ImportPreviewResult> {
    await WorkspaceService.assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId, {
      requireActive: true,
    });
    if (Buffer.byteLength(input.content, "utf8") > MAX_IMPORT_FILE_BYTES) {
      throwAppError({
        message: "File melebihi batas 10 MB",
        code: "citation_import_too_large",
        status: 413,
      });
    }
    const format = sniffBibliographyFormat(input.content);
    if (!format) {
      throwAppError({
        message: "File tidak dikenali sebagai BibTeX atau RIS",
        code: "citation_import_invalid",
        severity: "warning",
      });
    }
    const { entries, errors } = parseBibliographyFile(input.content, format);
    if (entries.length === 0 && errors.length === 0) {
      throwAppError({
        message: "Tidak ada entry bibliografi di dalam file",
        code: "citation_import_empty",
        severity: "warning",
      });
    }
    return stageImportBatch(db, {
      ownerUserId: input.ownerUserId,
      workspaceId: input.workspaceId,
      entries: entries.map((e) => ({ csl: e.csl })),
      parseErrors: errors,
      source: "import",
      sourceKind: "file",
      format,
      originalFilename: input.fileName,
    });
  },

  async commit(
    db: Db,
    input: {
      ownerUserId: string;
      workspaceId: string;
      batchId: string;
      selectedIndexes: number[];
      duplicatePolicy: ImportDuplicatePolicy;
    },
  ): Promise<ImportCommitResult> {
    await WorkspaceService.assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId, {
      requireActive: true,
    });
    const batch = await CitationImportBatchRepo.findById(db, input.ownerUserId, input.batchId);
    if (!batch || batch.workspaceId !== input.workspaceId) {
      throwAppError({
        message: "Batch import tidak ditemukan",
        code: "citation_batch_not_found",
        status: 404,
      });
    }
    if (batch.status !== "pending" || !Array.isArray(batch.recordsJson)) {
      throwAppError({
        message: "Batch import sudah di-commit",
        code: "citation_batch_committed",
        status: 409,
        severity: "warning",
      });
    }
    const staged = batch.recordsJson as StagedImportRecord[];
    const selected = new Set(input.selectedIndexes);
    const chosen = staged.filter((r) => selected.has(r.index));
    const isProviderSync = batch.sourceKind === "provider_sync";
    const batchProvider = (batch.provider ?? null) as CitationProvider | null;

    const result: ImportCommitResult = { created: 0, merged: 0, skipped: 0 };
    const now = Date.now();

    await db.transaction(async (tx) => {
      // Re-check duplikat saat commit — library bisa berubah sejak preview.
      const current = await WorkspaceCitationRepo.findActiveByCanonicalKeys(
        tx,
        input.ownerUserId,
        input.workspaceId,
        chosen.map((r) => r.canonicalKey),
      );
      const currentByKey = new Map(current.map((c) => [c.canonicalKey, c]));
      // Provider sync: cocokkan juga by externalId (idempotensi + hindari unique violation).
      const currentByExternal = new Map<string, WorkspaceCitation>();
      if (isProviderSync && batchProvider) {
        const externalIds = chosen
          .map((r) => r.externalId)
          .filter((v): v is string => Boolean(v));
        const currentExternal = await WorkspaceCitationRepo.findActiveByExternalIds(
          tx,
          input.ownerUserId,
          input.workspaceId,
          batchProvider,
          externalIds,
        );
        for (const c of currentExternal) {
          if (c.externalId) currentByExternal.set(c.externalId, c);
        }
      }
      const rowsToInsert: NewWorkspaceCitation[] = [];
      const insertedKeys = new Set<string>();

      for (const record of chosen) {
        const existing =
          (record.externalId ? currentByExternal.get(record.externalId) : undefined) ??
          currentByKey.get(record.canonicalKey);
        const batchDuplicate = insertedKeys.has(record.canonicalKey);
        if (existing || batchDuplicate) {
          if (input.duplicatePolicy === "skip") {
            result.skipped++;
            continue;
          }
          if (input.duplicatePolicy === "merge") {
            if (existing) {
              const patch = missingFieldPatch(existing, record);
              if (Object.keys(patch).length > 0) {
                await WorkspaceCitationRepo.updateById(tx, existing.id, {
                  ...patch,
                  updatedAt: now,
                });
              }
              result.merged++;
            } else {
              // Duplikat antar-record batch tanpa row existing → yang pertama sudah masuk.
              result.skipped++;
            }
            continue;
          }
          // policy "import": jatuh ke insert di bawah.
        }
        rowsToInsert.push({
          id: crypto.randomUUID(),
          ownerUserId: input.ownerUserId,
          workspaceId: input.workspaceId,
          artifactId: null,
          source: isProviderSync ? "provider_sync" : "import",
          provider: isProviderSync ? batchProvider : null,
          externalId: isProviderSync ? (record.externalId ?? null) : null,
          documentType: record.columns.documentType,
          title: record.columns.title,
          authorsJson: record.columns.authors,
          publishedYear: record.columns.publishedYear,
          venue: record.columns.venue,
          publisher: record.columns.publisher,
          doi: record.columns.doi,
          url: record.columns.url,
          tags: [],
          cslJson: record.csl,
          canonicalKey: record.canonicalKey,
          metadataStatus: record.metadataStatus,
          createdAt: now,
          updatedAt: now,
        });
        insertedKeys.add(record.canonicalKey);
        result.created++;
      }

      await WorkspaceCitationRepo.insertMany(tx, rowsToInsert);
      await CitationImportBatchRepo.updateById(tx, batch.id, {
        status: "committed",
        committedAt: now,
        updatedAt: now,
        recordsJson: null,
        summaryJson: result,
      });
    });

    return result;
  },
};

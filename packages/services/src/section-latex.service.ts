import {
  ArtifactContentRepo,
  ArtifactRepo,
  CitationRepo,
  type Db,
  type DbOrTx,
  DocumentRevisionRepo,
  type SectionStatus,
  throwAppError,
  WorkspaceSectionRepo,
} from "@aqsha/db";
import { previewFromText } from "./artifacts/model";
import { CitationUsageService, type ParsedCitationCluster } from "./citations/citation-usages";
import { scanCiteKeys } from "./latex/cite-scan";
import { SectionService } from "./section.service";

export const LATEX_SOURCE_MAX_BYTES = 2 * 1024 * 1024;
export const DOCUMENT_REVISION_RETENTION = 20;

export type DocumentAuthor = "user" | "agent" | "system";

export type SaveSectionDocumentResult =
  | { status: "saved"; artifactId: string; contentVersion: number; sectionStatus: SectionStatus }
  | { status: "stale_write"; currentVersion: number };

export type SectionDocumentPayload = {
  artifactId: string;
  source: string;
  contentVersion: number;
  updatedAt: number;
} | null;

/** Sentinel rollback: kalah race di dalam tx → keluar sebagai stale_write, bukan throw API. */
class StaleWriteRollback extends Error {}

/** \cite scan → cluster usage (satu kemunculan = satu cluster; key asing diabaikan). */
async function clustersFromSource(
  db: DbOrTx,
  ownerUserId: string,
  source: string,
): Promise<ParsedCitationCluster[]> {
  const keys = scanCiteKeys(source);
  if (keys.length === 0) return [];
  const rows = await CitationRepo.findByBibKeys(db, ownerUserId, [...new Set(keys)]);
  const idByKey = new Map(rows.flatMap((r) => (r.bibKey ? [[r.bibKey, r.id] as const] : [])));
  return keys.flatMap((key) => {
    const citationId = idByKey.get(key);
    return citationId ? [{ nodeId: "", citationIds: [citationId], locator: {} }] : [];
  });
}

export const SectionLatexService = {
  /** Sumber LaTeX bab + versi. Null = bab belum pernah ditulis (lazy-create saat save pertama). */
  async getDocument(
    db: DbOrTx,
    input: { ownerUserId: string; sectionId: string },
  ): Promise<SectionDocumentPayload> {
    const section = await SectionService.assertSectionOwner(db, input.ownerUserId, input.sectionId);
    if (!section.documentArtifactId) return null;
    const artifact = await ArtifactRepo.findById(db, section.documentArtifactId);
    if (!artifact || artifact.ownerUserId !== input.ownerUserId || artifact.status !== "active") {
      return null;
    }
    const content = await ArtifactContentRepo.findByArtifact(db, input.ownerUserId, artifact.id);
    return {
      artifactId: artifact.id,
      source: content?.plainText ?? "",
      contentVersion: artifact.contentVersion ?? 0,
      updatedAt: artifact.updatedAt,
    };
  },

  /**
   * Simpan sumber LaTeX satu bab — SATU transaksi atomik: teks + versi + revisi +
   * usages + status bab naik bersama, atau tidak sama sekali (sumber selalu inline
   * Postgres, tak pernah R2 — tak ada jendela blob/DB saling bohong).
   *
   * Versi optimistic: `baseVersion` wajib cocok → selain itu union `stale_write`
   * (semua penulis — user, agen, system — lewat jalur ini; konsumen dilarang
   * menimpa, wajib baca-ulang/merge). Race lazy-create dipagari klaim pointer
   * kondisional; race di dalam tx dipagari update versi kondisional.
   */
  async saveDocument(
    db: Db,
    input: {
      ownerUserId: string;
      sectionId: string;
      source: string;
      baseVersion?: number;
      author: DocumentAuthor;
    },
  ): Promise<SaveSectionDocumentResult> {
    const section = await SectionService.assertSectionOwner(db, input.ownerUserId, input.sectionId);
    if (section.role === "bibliography") {
      throwAppError({
        message: "Daftar pustaka digenerate otomatis dan tidak bisa diedit",
        code: "bibliography_not_editable",
        severity: "warning",
        status: 422,
      });
    }
    if (Buffer.byteLength(input.source, "utf8") > LATEX_SOURCE_MAX_BYTES) {
      throwAppError({
        message: "Sumber LaTeX terlalu besar. Maksimum 2 MB.",
        code: "latex_source_too_large",
        severity: "warning",
        status: 413,
      });
    }

    const now = Date.now();
    const clusters = await clustersFromSource(db, input.ownerUserId, input.source);
    const sectionStatus: SectionStatus =
      section.status === "empty" ? "draft" : (section.status as SectionStatus);

    if (!section.documentArtifactId) {
      const artifactId = crypto.randomUUID();
      try {
        await db.transaction(async (tx) => {
          await ArtifactRepo.insert(tx, {
            id: artifactId,
            ownerUserId: input.ownerUserId,
            workspaceId: section.workspaceId,
            folderId: null,
            threadId: null,
            artifactType: "latex",
            artifactFamily: "text",
            source: "manual",
            title: section.title,
            language: "latex",
            mimeType: null,
            fileName: null,
            byteSize: null,
            indexingStatus: "not_indexed",
            indexingFailureReason: null,
            detectedDocumentKind: null,
            storageR2Key: null,
            ragEntryId: null,
            plainTextPreview: previewFromText(input.source),
            indexedAt: null,
            contentVersion: 1,
            status: "active",
            deletedAt: null,
            createdAt: now,
            updatedAt: now,
          });
          await ArtifactContentRepo.insert(tx, {
            id: crypto.randomUUID(),
            ownerUserId: input.ownerUserId,
            workspaceId: section.workspaceId,
            threadId: null,
            artifactId,
            blocksJson: null,
            markdown: "",
            plainText: input.source,
            contextText: "",
            plainTextR2Key: null,
            blocksJsonR2Key: null,
            markdownR2Key: null,
            createdAt: now,
            updatedAt: now,
          });
          const claimed = await WorkspaceSectionRepo.setDocumentArtifactIfNull(
            tx,
            section.id,
            artifactId,
            now,
          );
          if (!claimed) throw new StaleWriteRollback();
          if (section.status === "empty") {
            await WorkspaceSectionRepo.update(tx, section.id, { status: "draft", updatedAt: now });
          }
          await DocumentRevisionRepo.insert(tx, {
            id: crypto.randomUUID(),
            ownerUserId: input.ownerUserId,
            artifactId,
            version: 1,
            source: input.source,
            author: input.author,
            createdAt: now,
          });
          await CitationUsageService.reconcileClusters(tx, {
            ownerUserId: input.ownerUserId,
            workspaceId: section.workspaceId,
            documentArtifactId: artifactId,
            clusters,
          });
        });
      } catch (err) {
        if (err instanceof StaleWriteRollback) {
          const current = await this.getDocument(db, {
            ownerUserId: input.ownerUserId,
            sectionId: input.sectionId,
          });
          return { status: "stale_write", currentVersion: current?.contentVersion ?? 0 };
        }
        throw err;
      }
      return { status: "saved", artifactId, contentVersion: 1, sectionStatus };
    }

    const artifact = await ArtifactRepo.findById(db, section.documentArtifactId);
    if (
      !artifact ||
      artifact.ownerUserId !== input.ownerUserId ||
      artifact.status !== "active" ||
      artifact.artifactType !== "latex"
    ) {
      throwAppError({
        message: "Dokumen bab tidak ditemukan",
        code: "section_document_not_found",
        severity: "error",
        status: 404,
      });
    }
    const currentVersion = artifact.contentVersion ?? 0;
    if (input.baseVersion === undefined || input.baseVersion !== currentVersion) {
      return { status: "stale_write", currentVersion };
    }
    const nextVersion = currentVersion + 1;
    try {
      await db.transaction(async (tx) => {
        const won = await ArtifactRepo.updateIfVersion(tx, artifact.id, currentVersion, {
          contentVersion: nextVersion,
          plainTextPreview: previewFromText(input.source),
          updatedAt: now,
        });
        if (!won) throw new StaleWriteRollback();
        await ArtifactContentRepo.updateByArtifact(tx, artifact.id, {
          plainText: input.source,
          plainTextR2Key: null,
          updatedAt: now,
        });
        await DocumentRevisionRepo.insert(tx, {
          id: crypto.randomUUID(),
          ownerUserId: input.ownerUserId,
          artifactId: artifact.id,
          version: nextVersion,
          source: input.source,
          author: input.author,
          createdAt: now,
        });
        await DocumentRevisionRepo.deleteOlderThan(
          tx,
          artifact.id,
          nextVersion - DOCUMENT_REVISION_RETENTION + 1,
        );
        if (section.status === "empty") {
          await WorkspaceSectionRepo.update(tx, section.id, { status: "draft", updatedAt: now });
        }
        await CitationUsageService.reconcileClusters(tx, {
          ownerUserId: input.ownerUserId,
          workspaceId: section.workspaceId,
          documentArtifactId: artifact.id,
          clusters,
        });
      });
    } catch (err) {
      if (err instanceof StaleWriteRollback) {
        const fresh = await ArtifactRepo.findById(db, artifact.id);
        return { status: "stale_write", currentVersion: fresh?.contentVersion ?? currentVersion };
      }
      throw err;
    }
    return { status: "saved", artifactId: artifact.id, contentVersion: nextVersion, sectionStatus };
  },
};

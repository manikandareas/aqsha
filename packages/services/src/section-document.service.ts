import {
  ArtifactContentRepo,
  ArtifactRepo,
  type Db,
  type SectionStatus,
  throwAppError,
  WorkspaceSectionRepo,
} from "@aqsha/db";
import { extractStoredDocument } from "./artifacts/extract";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, previewFromText } from "./artifacts/model";
import { CitationUsageService, type ParsedCitationCluster } from "./citations/citation-usages";
import { SectionService } from "./section.service";
import { StorageService } from "./storage.service";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type SaveSectionDocumentResult =
  | { status: "saved"; artifactId: string; contentVersion: number; sectionStatus: SectionStatus }
  | { status: "stale_write"; currentVersion: number };

/**
 * Parse clusters sitasi kiriman editor. JSON/shape rusak = error keras — fallback []
 * akan MENGHAPUS seluruh usage dokumen secara senyap saat reconcile.
 */
export function parseClustersJson(raw: string | undefined): ParsedCitationCluster[] {
  if (!raw || !raw.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  const valid =
    Array.isArray(parsed) &&
    parsed.every(
      (c) =>
        typeof (c as ParsedCitationCluster)?.nodeId === "string" &&
        Array.isArray((c as ParsedCitationCluster)?.citationIds),
    );
  if (!valid) {
    throwAppError({
      message: "Data sitasi dokumen tidak valid",
      code: "document_clusters_invalid",
      severity: "warning",
      status: 422,
    });
  }
  return (parsed as ParsedCitationCluster[]).map((c) => ({
    nodeId: c.nodeId,
    citationIds: c.citationIds.filter((id) => typeof id === "string" && id),
    locator: c.locator ?? {},
  }));
}

/** Ekstrak plain text DOCX untuk preview/pencarian — kegagalan tidak boleh menggagalkan save. */
async function safeExtractPlainText(bytes: Uint8Array, fileName: string): Promise<string | null> {
  try {
    const extracted = await extractStoredDocument(bytes, fileName, DOCX_MIME);
    return extracted.plainText;
  } catch (err) {
    console.error("[section-document] plain text extraction failed", err);
    return null;
  }
}

export const SectionDocumentService = {
  /**
   * Simpan DOCX satu bab. Lazy-create: artifact baru lahir di save pertama (buka-lalu-pergi
   * tidak meninggalkan artifact kosong). Versi optimistic: `baseVersion` wajib cocok dengan
   * `contentVersion` tersimpan — selain itu `stale_write` (union, bukan throw; tab lain sudah
   * menulis dan UI menawarkan muat ulang alih-alih menimpa tanpa sepengetahuan user).
   */
  async saveDocument(
    db: Db,
    input: {
      ownerUserId: string;
      sectionId: string;
      bytes: Uint8Array;
      fileName: string;
      baseVersion?: number;
      clusters: ParsedCitationCluster[];
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
    if (input.bytes.byteLength > MAX_UPLOAD_BYTES) {
      throwAppError({
        message: `Dokumen terlalu besar. Maksimum ${MAX_UPLOAD_MB} MB.`,
        code: "document_too_large",
        severity: "warning",
        status: 413,
      });
    }

    const now = Date.now();
    // Inline plainText as-is: unlike open-ended document uploads, a `text` column has no
    // size ceiling Drizzle/Postgres would reject, so there's no correctness reason to route
    // this through the maybeOffloadText detour used elsewhere for arbitrary-sized bodies.
    const plainText = await safeExtractPlainText(input.bytes, input.fileName);

    if (!section.documentArtifactId) {
      // Save pertama — blob ditulis sebelum tx (key butuh artifactId terlebih dulu; tx gagal
      // meninggalkan blob orphan, konsisten dengan pendekatan best-effort deleteStaleR2Keys
      // di tempat lain: kegagalan cleanup storage tidak boleh menggagalkan write DB).
      const artifactId = crypto.randomUUID();
      const key = await StorageService.storeBytes(
        input.ownerUserId,
        artifactId,
        "docx",
        input.bytes,
        DOCX_MIME,
      );
      const nextStatus: SectionStatus =
        section.status === "empty" ? "draft" : (section.status as SectionStatus);
      await db.transaction(async (tx) => {
        await ArtifactRepo.insert(tx, {
          id: artifactId,
          ownerUserId: input.ownerUserId,
          workspaceId: section.workspaceId,
          folderId: null,
          threadId: null,
          artifactType: "docx",
          artifactFamily: "file",
          source: "manual",
          title: section.title,
          language: null,
          mimeType: DOCX_MIME,
          fileName: input.fileName,
          byteSize: input.bytes.byteLength,
          indexingStatus: "not_indexed",
          indexingFailureReason: null,
          detectedDocumentKind: null,
          storageR2Key: key,
          ragEntryId: null,
          plainTextPreview: plainText ? previewFromText(plainText) : "",
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
          plainText: plainText ?? "",
          contextText: "",
          plainTextR2Key: null,
          blocksJsonR2Key: null,
          markdownR2Key: null,
          createdAt: now,
          updatedAt: now,
        });
        await WorkspaceSectionRepo.update(tx, section.id, {
          documentArtifactId: artifactId,
          updatedAt: now,
          ...(section.status === "empty" ? { status: "draft" as const } : {}),
        });
        await CitationUsageService.reconcileClusters(tx, {
          ownerUserId: input.ownerUserId,
          workspaceId: section.workspaceId,
          documentArtifactId: artifactId,
          clusters: input.clusters,
        });
      });
      return { status: "saved", artifactId, contentVersion: 1, sectionStatus: nextStatus };
    }

    // Save berikutnya — guard versi lalu timpa blob di key yang sama (pointer artifact stabil).
    const artifact = await ArtifactRepo.findById(db, section.documentArtifactId);
    if (
      !artifact ||
      artifact.ownerUserId !== input.ownerUserId ||
      artifact.status !== "active" ||
      artifact.artifactType !== "docx" ||
      !artifact.storageR2Key
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

    await StorageService.overwriteBytes(artifact.storageR2Key, input.bytes, DOCX_MIME);
    await db.transaction(async (tx) => {
      await ArtifactRepo.update(tx, artifact.id, {
        byteSize: input.bytes.byteLength,
        fileName: input.fileName,
        contentVersion: currentVersion + 1,
        ...(plainText !== null ? { plainTextPreview: previewFromText(plainText) } : {}),
        updatedAt: now,
      });
      if (plainText !== null) {
        await ArtifactContentRepo.updateByArtifact(tx, artifact.id, {
          plainText,
          plainTextR2Key: null,
          updatedAt: now,
        });
      }
      await CitationUsageService.reconcileClusters(tx, {
        ownerUserId: input.ownerUserId,
        workspaceId: section.workspaceId,
        documentArtifactId: artifact.id,
        clusters: input.clusters,
      });
    });
    return {
      status: "saved",
      artifactId: artifact.id,
      contentVersion: currentVersion + 1,
      sectionStatus: section.status as SectionStatus,
    };
  },
};

import {
  ArtifactContentRepo,
  ArtifactRepo,
  CitationRepo,
  type Db,
  type DbOrTx,
  DocumentRevisionRepo,
  throwAppError,
  type Workspace,
  WorkspaceRepo,
} from "@aqsha/db";
import { previewFromTypstSource } from "./artifacts/model";
import { CitationUsageService, type ParsedCitationCluster } from "./citations/citation-usages";
import { scanTypstCiteKeys } from "./typst/cite-scan";

export const TYPST_SOURCE_MAX_BYTES = 2 * 1024 * 1024;
export const DOCUMENT_REVISION_RETENTION = 20;

export type DocumentAuthor = "user" | "agent" | "system";

export type SaveWorkspaceDocumentResult =
  | { status: "saved"; artifactId: string; contentVersion: number }
  | { status: "stale_write"; currentVersion: number };

export type WorkspaceDocumentPayload = {
  artifactId: string;
  source: string;
  contentVersion: number;
  updatedAt: number;
} | null;

/** Sentinel rollback: kalah race di dalam tx → keluar sebagai stale_write, bukan throw API. */
class StaleWriteRollback extends Error {}

async function assertWorkspaceOwner(
  db: DbOrTx,
  ownerUserId: string,
  workspaceId: string,
): Promise<Workspace> {
  const workspace = await WorkspaceRepo.findById(db, workspaceId);
  if (!workspace || workspace.ownerUserId !== ownerUserId) {
    throwAppError({
      message: "Workspace not found",
      code: "workspace_not_found",
      severity: "error",
      status: 404,
    });
  }
  return workspace;
}

/** Scan sitasi Typst → cluster usage (satu kemunculan = satu cluster; key asing diabaikan). */
async function clustersFromSource(
  db: DbOrTx,
  ownerUserId: string,
  source: string,
): Promise<ParsedCitationCluster[]> {
  const keys = scanTypstCiteKeys(source);
  if (keys.length === 0) return [];
  const rows = await CitationRepo.findByBibKeys(db, ownerUserId, [...new Set(keys)]);
  const idByKey = new Map(rows.flatMap((r) => (r.bibKey ? [[r.bibKey, r.id] as const] : [])));
  return keys.flatMap((key) => {
    const citationId = idByKey.get(key);
    return citationId ? [{ nodeId: "", citationIds: [citationId], locator: {} }] : [];
  });
}

function isActiveTypst(
  artifact: Awaited<ReturnType<typeof ArtifactRepo.findById>>,
  ownerUserId: string,
): boolean {
  return (
    artifact != null &&
    artifact.ownerUserId === ownerUserId &&
    artifact.status === "active" &&
    artifact.artifactType === "typst"
  );
}

export const WorkspaceDocumentService = {
  /** Sumber Typst proyek + versi. Null = dokumen belum pernah ditulis (lazy-create saat save pertama). */
  async getDocument(
    db: DbOrTx,
    input: { ownerUserId: string; workspaceId: string },
  ): Promise<WorkspaceDocumentPayload> {
    const workspace = await assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId);
    if (!workspace.documentArtifactId) return null;
    const artifact = await ArtifactRepo.findById(db, workspace.documentArtifactId);
    if (!isActiveTypst(artifact, input.ownerUserId)) return null;
    const content = await ArtifactContentRepo.findByArtifact(db, input.ownerUserId, artifact!.id);
    return {
      artifactId: artifact!.id,
      source: content?.plainText ?? "",
      contentVersion: artifact!.contentVersion ?? 0,
      updatedAt: artifact!.updatedAt,
    };
  },

  /**
   * Insert dokumen Typst awal proyek dalam transaksi caller (dipakai saat create project) —
   * tak ada CAS/guard race karena workspace baru dibuat di tx yang sama. Mengembalikan artifactId.
   */
  async insertInitialDocument(
    tx: DbOrTx,
    input: {
      ownerUserId: string;
      workspaceId: string;
      title: string;
      source: string;
      author: DocumentAuthor;
    },
  ): Promise<string> {
    const now = Date.now();
    const artifactId = crypto.randomUUID();
    await ArtifactRepo.insert(tx, {
      id: artifactId,
      ownerUserId: input.ownerUserId,
      workspaceId: input.workspaceId,
      folderId: null,
      threadId: null,
      artifactType: "typst",
      artifactFamily: "text",
      source: "manual",
      title: input.title,
      language: "typst",
      mimeType: null,
      fileName: null,
      byteSize: null,
      indexingStatus: "not_indexed",
      indexingFailureReason: null,
      detectedDocumentKind: null,
      storageR2Key: null,
      ragEntryId: null,
      plainTextPreview: previewFromTypstSource(input.source),
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
      workspaceId: input.workspaceId,
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
    await WorkspaceRepo.update(tx, input.workspaceId, {
      documentArtifactId: artifactId,
      updatedAt: now,
    });
    await DocumentRevisionRepo.insert(tx, {
      id: crypto.randomUUID(),
      ownerUserId: input.ownerUserId,
      artifactId,
      version: 1,
      source: input.source,
      author: input.author,
      createdAt: now,
    });
    const clusters = await clustersFromSource(tx, input.ownerUserId, input.source);
    await CitationUsageService.reconcileClusters(tx, {
      ownerUserId: input.ownerUserId,
      workspaceId: input.workspaceId,
      documentArtifactId: artifactId,
      clusters,
    });
    return artifactId;
  },

  /**
   * Simpan sumber Typst proyek — SATU transaksi atomik: teks + versi + revisi + usages naik
   * bersama, atau tidak sama sekali (sumber selalu inline Postgres, tak pernah R2).
   *
   * Versi optimistic: `baseVersion` wajib cocok → selain itu union `stale_write` (semua penulis
   * — user, agen, system — lewat jalur ini; konsumen wajib baca-ulang/merge). Race lazy-create
   * dipagari klaim pointer kondisional; race di dalam tx dipagari update versi kondisional.
   */
  async saveDocument(
    db: Db,
    input: {
      ownerUserId: string;
      workspaceId: string;
      source: string;
      baseVersion?: number;
      author: DocumentAuthor;
    },
  ): Promise<SaveWorkspaceDocumentResult> {
    const workspace = await assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId);
    if (Buffer.byteLength(input.source, "utf8") > TYPST_SOURCE_MAX_BYTES) {
      throwAppError({
        message: "Sumber Typst terlalu besar. Maksimum 2 MB.",
        code: "typst_source_too_large",
        severity: "warning",
        status: 413,
      });
    }

    const now = Date.now();
    const clusters = await clustersFromSource(db, input.ownerUserId, input.source);
    const title = workspace.name.trim() || "Dokumen proyek";

    const existing = workspace.documentArtifactId
      ? await ArtifactRepo.findById(db, workspace.documentArtifactId)
      : null;

    if (!isActiveTypst(existing, input.ownerUserId)) {
      // Proyek belum punya dokumen Typst valid: belum pernah ditulis (pointer null) ATAU pointer
      // lama menunjuk artifact non-Typst (sisa migrasi). Buat artifact Typst baru & set pointer;
      // baseVersion diabaikan — tak ada versi Typst untuk di-CAS, tak ada tulisan yang tertimpa.
      const artifactId = crypto.randomUUID();
      const hadStalePointer = workspace.documentArtifactId != null;
      try {
        await db.transaction(async (tx) => {
          await ArtifactRepo.insert(tx, {
            id: artifactId,
            ownerUserId: input.ownerUserId,
            workspaceId: input.workspaceId,
            folderId: null,
            threadId: null,
            artifactType: "typst",
            artifactFamily: "text",
            source: "manual",
            title,
            language: "typst",
            mimeType: null,
            fileName: null,
            byteSize: null,
            indexingStatus: "not_indexed",
            indexingFailureReason: null,
            detectedDocumentKind: null,
            storageR2Key: null,
            ragEntryId: null,
            plainTextPreview: previewFromTypstSource(input.source),
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
            workspaceId: input.workspaceId,
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
          if (hadStalePointer) {
            // Repoint dari artifact non-Typst lama (last-writer-wins; jalur pemulihan jarang).
            await WorkspaceRepo.update(tx, input.workspaceId, {
              documentArtifactId: artifactId,
              updatedAt: now,
            });
          } else {
            const claimed = await WorkspaceRepo.setDocumentArtifactIfNull(
              tx,
              input.workspaceId,
              artifactId,
              now,
            );
            if (!claimed) throw new StaleWriteRollback();
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
            workspaceId: input.workspaceId,
            documentArtifactId: artifactId,
            clusters,
          });
        });
      } catch (err) {
        if (err instanceof StaleWriteRollback) {
          const current = await this.getDocument(db, {
            ownerUserId: input.ownerUserId,
            workspaceId: input.workspaceId,
          });
          return { status: "stale_write", currentVersion: current?.contentVersion ?? 0 };
        }
        throw err;
      }
      return { status: "saved", artifactId, contentVersion: 1 };
    }

    // existing valid & non-null (jalur update CAS).
    const artifact = existing!;
    const currentVersion = artifact.contentVersion ?? 0;
    if (input.baseVersion === undefined || input.baseVersion !== currentVersion) {
      return { status: "stale_write", currentVersion };
    }
    const nextVersion = currentVersion + 1;
    try {
      await db.transaction(async (tx) => {
        const won = await ArtifactRepo.updateIfVersion(tx, artifact.id, currentVersion, {
          contentVersion: nextVersion,
          plainTextPreview: previewFromTypstSource(input.source),
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
        await CitationUsageService.reconcileClusters(tx, {
          ownerUserId: input.ownerUserId,
          workspaceId: input.workspaceId,
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
    return { status: "saved", artifactId: artifact.id, contentVersion: nextVersion };
  },
};

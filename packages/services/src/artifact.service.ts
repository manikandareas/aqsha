import {
  type Artifact,
  type ArtifactContent,
  ArtifactContentRepo,
  ArtifactEmbeddingRepo,
  ArtifactExtractionRepo,
  ArtifactPaperMetadataRepo,
  ArtifactRepo,
  type ArtifactUrl,
  ArtifactUrlRepo,
  type Db,
  type DbOrTx,
  decodeKeysetCursor,
  type NewArtifact,
  throwAppError,
} from "@aqsha/db";
import { assertLibraryCapacity } from "./artifacts/capacity";
import { extractIndexAndPatch } from "./artifacts/extract-pipeline";
import {
  ARTIFACT_BODY_INLINE_LIMIT,
  artifactFamilyForType,
  type ArtifactFamily,
  type ArtifactSource,
  type ArtifactType,
  contextFromText,
  defaultLanguageForArtifactType,
  type DetectedDocumentKind,
  type IndexingStatus,
  INLINE_INDEX_MAX_BYTES,
  normalizeArtifactTitle,
  normalizeUrl,
  previewFromText,
  siteNameFromUrl,
  titleFromFileName,
  titleFromUrl,
  validateUpload,
} from "./artifacts/model";
import { syncArtifactWorkspaceMove } from "./artifacts/move";
import { ARTIFACT_QUEUES, enqueue } from "./clients/queue";
import { FolderService } from "./folder.service";
import { StorageService } from "./storage.service";
import { WorkspaceService } from "./workspace.service";

const MARKDOWN_TITLE_FALLBACK = "Untitled markdown";

// ----- Read models (kontrak 05) -----
export type ArtifactListItem = {
  _id: string;
  workspaceId: string | null;
  folderId: string | null;
  artifactType: ArtifactType;
  artifactFamily: ArtifactFamily;
  source: ArtifactSource;
  title: string;
  language: string | null;
  mimeType: string | null;
  fileName: string | null;
  byteSize: number | null;
  indexingStatus: IndexingStatus;
  indexingFailureReason: string | null;
  detectedDocumentKind: DetectedDocumentKind | null;
  plainTextPreview: string | null;
  status: "active" | "deleted";
  createdAt: number;
  updatedAt: number;
};

/**
 * Cap teks ekstraksi yang dikembalikan ke AGEN via `get_render_payload` (~20k token). Dokumen
 * panjang (mis. survey 180k+ char) penuh akan membengkakkan konteks LLM / berisiko melewati window
 * → turn gagal. Potong + beri penanda; bagian spesifik tetap dijangkau lewat `search_thread_documents`.
 */
const MAX_RENDER_EXTRACTED_TEXT_CHARS = 80_000;

export type ArtifactRenderPayload =
  | { artifactType: "markdown"; blocksJson: string; markdown: string; plainText: string }
  | {
      artifactType: "pdf" | "docx" | "image";
      fileName: string;
      mimeType: string;
      byteSize: number;
      url: string;
      indexingStatus: IndexingStatus;
      indexingFailureReason?: string;
      /** Teks hasil ekstraksi indexing (pdf/docx) — agar agen bisa MEMBACA isinya (URL presigned
       * tak dapat diparse agen). Absen untuk image / dokumen yang belum/ gagal terindeks. */
      extractedText?: string;
    }
  | {
      artifactType: "url";
      originalUrl: string;
      normalizedUrl: string;
      status: "pending" | "ready" | "failed";
      title?: string;
      description?: string;
      siteName?: string;
      failureReason?: string;
      readableText: string;
    }
  | {
      artifactType: "plain_text" | "html" | "svg" | "mermaid" | "json" | "csv" | "code";
      source: string;
      language?: string;
    };

function toArtifactListItem(a: Artifact): ArtifactListItem {
  return {
    _id: a.id,
    workspaceId: a.workspaceId,
    folderId: a.folderId,
    artifactType: a.artifactType as ArtifactType,
    artifactFamily: a.artifactFamily as ArtifactFamily,
    source: a.source as ArtifactSource,
    title: a.title,
    language: a.language,
    mimeType: a.mimeType,
    fileName: a.fileName,
    byteSize: a.byteSize,
    indexingStatus: a.indexingStatus as IndexingStatus,
    indexingFailureReason: a.indexingFailureReason,
    detectedDocumentKind: a.detectedDocumentKind as DetectedDocumentKind | null,
    plainTextPreview: a.plainTextPreview,
    status: a.status as "active" | "deleted",
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

function toContentReadModel(c: ArtifactContent | null) {
  if (!c) return null;
  return {
    _id: c.id,
    artifactId: c.artifactId,
    blocksJson: c.blocksJson != null ? JSON.stringify(c.blocksJson) : null,
    markdown: c.markdown,
    plainText: c.plainText,
    contextText: c.contextText,
    ingestionStatus: null as "pending" | "ready" | "failed" | null,
    ingestionFailureReason: null as string | null,
    ragEntryId: null as string | null,
    updatedAt: c.updatedAt,
  };
}

function toUrlReadModel(u: ArtifactUrl | null) {
  if (!u) return null;
  return {
    _id: u.id,
    originalUrl: u.originalUrl,
    normalizedUrl: u.normalizedUrl,
    status: u.status as "pending" | "ready" | "failed",
    title: u.title,
    description: u.description,
    siteName: u.siteName,
    readableText: u.readableText,
    failureReason: u.failureReason,
    extractedAt: u.extractedAt,
  };
}

/** Artifact workspace-scoped, aktif, owned (library ops). Throws `artifact_not_found`. */
async function assertWorkspaceArtifact(
  db: DbOrTx,
  ownerUserId: string,
  artifactId: string,
): Promise<Artifact & { workspaceId: string }> {
  const artifact = await ArtifactRepo.findById(db, artifactId);
  if (
    !artifact ||
    artifact.ownerUserId !== ownerUserId ||
    artifact.status !== "active" ||
    !artifact.workspaceId
  ) {
    throwAppError({
      message: "Artifact not found",
      code: "artifact_not_found",
      severity: "error",
      status: 404,
    });
  }
  return artifact as Artifact & { workspaceId: string };
}

/**
 * Best-effort hapus R2 key lama yang akan ditimpa (edit doc / re-crawl / retry) supaya
 * blob versi sebelumnya tak ter-orphan (purge hanya tahu pointer terkini). Non-fatal.
 */
async function deleteStaleR2Keys(keys: Array<string | null | undefined>): Promise<void> {
  for (const key of keys) {
    if (!key) continue;
    try {
      await StorageService.deleteObject(key);
    } catch (err) {
      console.error("[artifact] stale R2 delete failed", key, err);
    }
  }
}

/** Soft-delete satu artifact (status=deleted + tombstone timestamps). Dipakai `remove` (dalam tx) +
 * `removeThreadAttachment`. Enqueue cleanup TERPISAH (harus setelah tx commit). */
async function softDeleteArtifactRow(db: DbOrTx, artifactId: string): Promise<void> {
  const now = Date.now();
  await ArtifactRepo.update(db, artifactId, { status: "deleted", deletedAt: now, updatedAt: now });
}

/** Enqueue worker `artifact-cleanup` (hard-delete blob R2 + embeddings + child rows). */
async function enqueueArtifactCleanup(ownerUserId: string, artifactId: string): Promise<void> {
  await enqueue(ARTIFACT_QUEUES.artifactCleanup, { ownerUserId, artifactId });
}

export const ArtifactService = {
  toArtifactListItem,

  /** Buat dokumen Markdown kosong (manual, indexingStatus ready) + content kosong. */
  async createDocument(
    db: Db,
    input: {
      ownerUserId: string;
      ownerEmail?: string | null;
      workspaceId: string;
      folderId?: string;
      title?: string;
    },
  ): Promise<{ artifactId: string }> {
    const title = input.title?.trim() ? normalizeArtifactTitle(input.title) : MARKDOWN_TITLE_FALLBACK;
    const now = Date.now();
    const artifactId = crypto.randomUUID();
    const contentId = crypto.randomUUID();

    await db.transaction(async (tx) => {
      await WorkspaceService.assertWorkspaceOwner(tx, input.ownerUserId, input.workspaceId, {
        requireActive: true,
      });
      if (input.folderId) {
        await FolderService.assertFolderOwner(tx, input.ownerUserId, input.folderId, {
          workspaceId: input.workspaceId,
        });
      }
      await assertLibraryCapacity(tx, input.ownerUserId, input.ownerEmail);
      await ArtifactRepo.insert(tx, {
        id: artifactId,
        ownerUserId: input.ownerUserId,
        workspaceId: input.workspaceId,
        folderId: input.folderId ?? null,
        threadId: null,
        artifactType: "markdown",
        artifactFamily: "text",
        source: "manual",
        title,
        language: "markdown",
        mimeType: null,
        fileName: null,
        byteSize: null,
        indexingStatus: "ready",
        indexingFailureReason: null,
        detectedDocumentKind: null,
        storageR2Key: null,
        ragEntryId: null,
        plainTextPreview: "",
        indexedAt: null,
        status: "active",
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      await ArtifactContentRepo.insert(tx, {
        id: contentId,
        ownerUserId: input.ownerUserId,
        workspaceId: input.workspaceId,
        threadId: null,
        artifactId,
        blocksJson: null,
        markdown: "",
        plainText: "",
        contextText: "",
        plainTextR2Key: null,
        blocksJsonR2Key: null,
        markdownR2Key: null,
        createdAt: now,
        updatedAt: now,
      });
    });

    return { artifactId };
  },

  /**
   * Slice 6.5: materialize dokumen yang DIBUAT AGEN (tool `propose_artifact`, post-approval
   * HITL). BORN-HEADLESS: `source:'agent'`, `workspaceId:null`, `threadId` set — beda dari
   * `createDocument` yang workspace-scoped (assert owner + kapasitas). TANPA assert workspace
   * & TANPA gate kapasitas: artifact headless belum menempati slot library sampai
   * `linkToWorkspace`. Markdown ready langsung (plainText = teks markdown apa adanya).
   */
  async applyAgentAction(
    db: Db,
    input: { ownerUserId: string; threadId: string; title?: string; markdown: string },
  ): Promise<{ artifactId: string; title: string; artifactType: "markdown" }> {
    const title = input.title?.trim() ? normalizeArtifactTitle(input.title) : MARKDOWN_TITLE_FALLBACK;
    const markdown = input.markdown ?? "";
    const now = Date.now();
    const artifactId = crypto.randomUUID();
    const contentId = crypto.randomUUID();

    await db.transaction(async (tx) => {
      await ArtifactRepo.insert(tx, {
        id: artifactId,
        ownerUserId: input.ownerUserId,
        workspaceId: null,
        folderId: null,
        threadId: input.threadId,
        artifactType: "markdown",
        artifactFamily: "text",
        source: "agent",
        title,
        language: "markdown",
        mimeType: null,
        fileName: null,
        byteSize: null,
        indexingStatus: "ready",
        indexingFailureReason: null,
        detectedDocumentKind: null,
        storageR2Key: null,
        ragEntryId: null,
        plainTextPreview: previewFromText(markdown),
        indexedAt: null,
        status: "active",
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      await ArtifactContentRepo.insert(tx, {
        id: contentId,
        ownerUserId: input.ownerUserId,
        workspaceId: null,
        threadId: input.threadId,
        artifactId,
        blocksJson: null,
        markdown,
        plainText: markdown,
        contextText: contextFromText(markdown),
        plainTextR2Key: null,
        blocksJsonR2Key: null,
        markdownR2Key: null,
        createdAt: now,
        updatedAt: now,
      });
    });

    return { artifactId, title, artifactType: "markdown" };
  },

  /**
   * Slice 6.5: Save-to-Workspace untuk artifact HEADLESS (agen/chat-attachment,
   * `workspaceId=null`). HARUS method terpisah dari `update()`: `update()` lewat
   * `assertWorkspaceArtifact` yang menolak `workspaceId=null`. Di sini artifact valid =
   * owner + active + BELUM ter-file (`workspaceId=null`); sudah ter-file → pakai `update()`
   * (move). Gate workspace owner (requireActive) + kapasitas library (slot dipakai SAAT ini),
   * patch parent, cascade 4 side-table (`syncArtifactWorkspaceMove`).
   */
  async linkToWorkspace(
    db: Db,
    input: {
      ownerUserId: string;
      ownerEmail?: string | null;
      artifactId: string;
      workspaceId: string;
      folderId?: string;
    },
  ): Promise<{ ok: true }> {
    const now = Date.now();
    await db
      .transaction(async (tx) => {
        const artifact = await ArtifactRepo.findById(tx, input.artifactId);
        if (!artifact || artifact.ownerUserId !== input.ownerUserId || artifact.status !== "active") {
          throwAppError({
            message: "Artifact not found",
            code: "artifact_not_found",
            severity: "error",
            status: 404,
          });
        }
        if (artifact.workspaceId) {
          throwAppError({
            message: "Artifact already filed in a workspace",
            code: "artifact_already_linked",
            severity: "warning",
            status: 409,
          });
        }
        await WorkspaceService.assertWorkspaceOwner(tx, input.ownerUserId, input.workspaceId, {
          requireActive: true,
        });
        if (input.folderId) {
          await FolderService.assertFolderOwner(tx, input.ownerUserId, input.folderId, {
            workspaceId: input.workspaceId,
          });
        }
        await assertLibraryCapacity(tx, input.ownerUserId, input.ownerEmail);
        await ArtifactRepo.update(tx, input.artifactId, {
          workspaceId: input.workspaceId,
          folderId: input.folderId ?? null,
          updatedAt: now,
        });
        await syncArtifactWorkspaceMove(tx, {
          artifactIds: [input.artifactId],
          targetWorkspaceId: input.workspaceId,
          now,
        });
      })
      .catch((err) => {
        // URL headless ber-normalizedUrl bentrok di workspace tujuan → UNIQUE(owner,ws,url).
        if ((err as { code?: string }).code === "23505") {
          throwAppError({
            message: "Tautan ini sudah tersimpan di workspace tujuan.",
            code: "artifact_url_already_in_target_workspace",
            severity: "warning",
            status: 409,
          });
        }
        throw err;
      });
    return { ok: true };
  },

  /**
   * Step 1 upload: presign PUT (workspace-scoped, P3). Thread-attachment headless
   * upload menyusul P6. Assert owner + active dulu (tanpa cek tipe/size — itu di finalize).
   */
  async generateUploadUrl(
    db: DbOrTx,
    ownerUserId: string,
    workspaceId: string,
  ): Promise<{ uploadUrl: string; key: string }> {
    await WorkspaceService.assertWorkspaceOwner(db, ownerUserId, workspaceId, {
      requireActive: true,
    });
    return StorageService.generateUploadTarget(ownerUserId);
  },

  /**
   * Step 3 upload: finalize blob R2 → artifact + content. validateUpload (nama/size/
   * tipe allow-list), insert pending, lalu ekstrak teks INLINE (unpdf/mammoth/utf8) →
   * offload >limit → RAG index → ready. PDF → enqueue paper-enrichment (Slice 7).
   * Ekstraksi di luar tx (network/CPU); gagal → indexingStatus failed (upload tetap sukses).
   */
  async finalizeUpload(
    db: Db,
    input: {
      ownerUserId: string;
      ownerEmail?: string | null;
      workspaceId: string;
      folderId?: string;
      key: string;
      fileName: string;
      mimeType: string;
      size: number;
    },
  ): Promise<{ artifactId: string; title: string; indexed: boolean }> {
    const artifactType = validateUpload({
      fileName: input.fileName,
      mimeType: input.mimeType,
      size: input.size,
    });
    const title = titleFromFileName(input.fileName);
    const artifactId = crypto.randomUUID();
    const contentId = crypto.randomUUID();
    const now = Date.now();

    await db.transaction(async (tx) => {
      await WorkspaceService.assertWorkspaceOwner(tx, input.ownerUserId, input.workspaceId, {
        requireActive: true,
      });
      if (input.folderId) {
        await FolderService.assertFolderOwner(tx, input.ownerUserId, input.folderId, {
          workspaceId: input.workspaceId,
        });
      }
      await assertLibraryCapacity(tx, input.ownerUserId, input.ownerEmail);
      await ArtifactRepo.insert(tx, {
        id: artifactId,
        ownerUserId: input.ownerUserId,
        workspaceId: input.workspaceId,
        folderId: input.folderId ?? null,
        threadId: null,
        artifactType,
        artifactFamily: artifactFamilyForType(artifactType),
        source: "upload",
        title,
        language: defaultLanguageForArtifactType(artifactType) ?? null,
        mimeType: input.mimeType,
        fileName: input.fileName,
        byteSize: input.size,
        indexingStatus: "pending",
        indexingFailureReason: null,
        detectedDocumentKind: null,
        storageR2Key: input.key,
        ragEntryId: null,
        plainTextPreview: "Indexing is running.",
        indexedAt: null,
        status: "active",
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      await ArtifactContentRepo.insert(tx, {
        id: contentId,
        ownerUserId: input.ownerUserId,
        workspaceId: input.workspaceId,
        threadId: null,
        artifactId,
        blocksJson: null,
        markdown: "",
        plainText: "",
        contextText: "",
        plainTextR2Key: null,
        blocksJsonR2Key: null,
        markdownR2Key: null,
        createdAt: now,
        updatedAt: now,
      });
    });

    const { indexed, enrichText } = await extractIndexAndPatch(db, {
      ownerUserId: input.ownerUserId,
      artifactId,
      workspaceId: input.workspaceId,
      key: input.key,
      fileName: input.fileName,
      mimeType: input.mimeType,
      artifactType,
      startedAt: now,
    });

    // PDF → metadata enrichment (resolver) di worker (Slice 7), hanya bila ada teks.
    if (artifactType === "pdf" && enrichText && enrichText.trim()) {
      await enqueue(ARTIFACT_QUEUES.paperEnrichment, {
        ownerUserId: input.ownerUserId,
        artifactId,
        workspaceId: input.workspaceId,
        text: enrichText,
      });
    }

    return { artifactId, title, indexed };
  },

  /**
   * Slice 6.7 — presign upload untuk LAMPIRAN THREAD (chat). Workspace-agnostic:
   * ownership di-gate via `ThreadService.assertOwner` ROUTE-side (bukan workspace
   * assert), jadi method ini cuma reuse target presign. Validasi tipe/size di
   * `finalizeThreadUpload`.
   */
  async generateThreadUploadUrl(ownerUserId: string): Promise<{ uploadUrl: string; key: string }> {
    return StorageService.generateUploadTarget(ownerUserId);
  },

  /**
   * Slice 6.7 — finalize lampiran thread: BORN-HEADLESS (`workspaceId:null`,
   * `threadId` set, `source:'upload'`). Method terpisah dari `finalizeUpload`
   * (workspace-scoped) seperti `applyAgentAction` vs `createDocument`: TANPA assert
   * workspace & TANPA gate kapasitas (artifact headless belum menempati slot library
   * sampai `linkToWorkspace`). Tetap `validateUpload` (trust boundary) + ekstrak/RAG
   * index INLINE (scope thread → tool `list_artifacts`/`search_thread_documents` 6.4
   * menemukannya). PDF → enqueue paper-enrichment.
   */
  async finalizeThreadUpload(
    db: Db,
    input: {
      ownerUserId: string;
      threadId: string;
      key: string;
      fileName: string;
      mimeType: string;
      size: number;
    },
  ): Promise<{
    artifactId: string;
    title: string;
    indexed: boolean;
    indexingStatus: IndexingStatus;
  }> {
    const artifactType = validateUpload({
      fileName: input.fileName,
      mimeType: input.mimeType,
      size: input.size,
    });
    const title = titleFromFileName(input.fileName);
    const artifactId = crypto.randomUUID();
    const contentId = crypto.randomUUID();
    const now = Date.now();

    await db.transaction(async (tx) => {
      await ArtifactRepo.insert(tx, {
        id: artifactId,
        ownerUserId: input.ownerUserId,
        workspaceId: null,
        folderId: null,
        threadId: input.threadId,
        artifactType,
        artifactFamily: artifactFamilyForType(artifactType),
        source: "upload",
        title,
        language: defaultLanguageForArtifactType(artifactType) ?? null,
        mimeType: input.mimeType,
        fileName: input.fileName,
        byteSize: input.size,
        indexingStatus: "pending",
        indexingFailureReason: null,
        detectedDocumentKind: null,
        storageR2Key: input.key,
        ragEntryId: null,
        plainTextPreview: "Indexing is running.",
        indexedAt: null,
        status: "active",
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      await ArtifactContentRepo.insert(tx, {
        id: contentId,
        ownerUserId: input.ownerUserId,
        workspaceId: null,
        threadId: input.threadId,
        artifactId,
        blocksJson: null,
        markdown: "",
        plainText: "",
        contextText: "",
        plainTextR2Key: null,
        blocksJsonR2Key: null,
        markdownR2Key: null,
        createdAt: now,
        updatedAt: now,
      });
    });

    // File besar (D5): offload ekstraksi+index ke worker `artifact-indexing` supaya finalize
    // tak terblok. Artifact sudah `pending` (di atas) → FE poll status sampai ready/failed.
    if (input.size > INLINE_INDEX_MAX_BYTES) {
      await enqueue(ARTIFACT_QUEUES.artifactIndexing, {
        ownerUserId: input.ownerUserId,
        artifactId,
      });
      return { artifactId, title, indexed: false, indexingStatus: "pending" };
    }

    // ponytail: skip paper-enrichment untuk lampiran headless — worker scope metadata
    // ke workspace (`workspaceId: string`), yang null di sini; agen cuma butuh teks RAG
    // (sudah ter-index di extractIndexAndPatch). Enrichment menyusul saat di-promote.
    const { indexed } = await extractIndexAndPatch(db, {
      ownerUserId: input.ownerUserId,
      artifactId,
      workspaceId: null,
      key: input.key,
      fileName: input.fileName,
      mimeType: input.mimeType,
      artifactType,
      startedAt: now,
    });

    // Inline: extractIndexAndPatch men-set indexingStatus ready (indexed) / failed (gagal ekstraksi).
    return { artifactId, title, indexed, indexingStatus: indexed ? "ready" : "failed" };
  },

  /**
   * Worker `artifact-indexing` (D5): jalankan ekstraksi+RAG index untuk lampiran thread besar
   * yang di-offload `finalizeThreadUpload`. Idempoten: hanya proses artifact `pending` milik owner
   * (re-run job aman; `extractIndexAndPatch` men-set ready/failed + provenance). No-op bila artifact
   * hilang / sudah selesai / bukan upload.
   */
  async runAttachmentIndexing(
    db: Db,
    input: { ownerUserId: string; artifactId: string },
  ): Promise<void> {
    const artifact = await ArtifactRepo.findById(db, input.artifactId);
    if (
      !artifact ||
      artifact.ownerUserId !== input.ownerUserId ||
      artifact.indexingStatus !== "pending" ||
      !artifact.storageR2Key
    ) {
      return;
    }
    await extractIndexAndPatch(db, {
      ownerUserId: artifact.ownerUserId,
      artifactId: artifact.id,
      workspaceId: artifact.workspaceId,
      key: artifact.storageR2Key,
      fileName: artifact.fileName ?? "attachment",
      mimeType: artifact.mimeType ?? "application/octet-stream",
      // Kolom `artifact_type` = text; baris ini dibuat `finalizeThreadUpload` via `validateUpload`
      // → selalu ArtifactType valid. Narrow aman untuk pemilihan extractor.
      artifactType: artifact.artifactType as ArtifactType,
      startedAt: Date.now(),
    });
  },

  /**
   * Save-to-Workspace (createUrl): normalizeUrl + dedupe by (owner, workspace,
   * normalizedUrl) → idempotent. Insert artifact `url` (pending) + artifact_urls,
   * enqueue url-ingestion. UNIQUE constraint = backstop race (catch 23505 → existing).
   */
  async saveUrl(
    db: Db,
    input: {
      ownerUserId: string;
      ownerEmail?: string | null;
      workspaceId: string;
      folderId?: string;
      url: string;
      title?: string;
    },
  ): Promise<{ artifactId: string }> {
    const normalizedUrl = normalizeUrl(input.url);
    const existing = await ArtifactUrlRepo.findByNormalizedUrl(
      db,
      input.ownerUserId,
      input.workspaceId,
      normalizedUrl,
    );
    if (existing) {
      const art = await ArtifactRepo.findById(db, existing.artifactId);
      if (art && art.ownerUserId === input.ownerUserId && art.status === "active") {
        return { artifactId: art.id };
      }
    }

    const title = input.title?.trim() ? normalizeArtifactTitle(input.title) : titleFromUrl(normalizedUrl);
    const artifactId = crypto.randomUUID();
    const urlRowId = crypto.randomUUID();
    const now = Date.now();

    try {
      await db.transaction(async (tx) => {
        await WorkspaceService.assertWorkspaceOwner(tx, input.ownerUserId, input.workspaceId, {
          requireActive: true,
        });
        if (input.folderId) {
          await FolderService.assertFolderOwner(tx, input.ownerUserId, input.folderId, {
            workspaceId: input.workspaceId,
          });
        }
        await assertLibraryCapacity(tx, input.ownerUserId, input.ownerEmail);
        await ArtifactRepo.insert(tx, {
          id: artifactId,
          ownerUserId: input.ownerUserId,
          workspaceId: input.workspaceId,
          folderId: input.folderId ?? null,
          threadId: null,
          artifactType: "url",
          artifactFamily: "link",
          source: "url",
          title,
          language: "url",
          mimeType: "text/uri-list",
          fileName: null,
          byteSize: null,
          indexingStatus: "pending",
          indexingFailureReason: null,
          detectedDocumentKind: null,
          storageR2Key: null,
          ragEntryId: null,
          plainTextPreview: normalizedUrl,
          indexedAt: null,
          status: "active",
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        });
        await ArtifactUrlRepo.insert(tx, {
          id: urlRowId,
          ownerUserId: input.ownerUserId,
          workspaceId: input.workspaceId,
          artifactId,
          originalUrl: input.url.trim(),
          normalizedUrl,
          status: "pending",
          title,
          description: null,
          siteName: siteNameFromUrl(normalizedUrl),
          readableText: null,
          contextText: normalizedUrl,
          readableTextR2Key: null,
          failureReason: null,
          extractedAt: null,
          createdAt: now,
          updatedAt: now,
        });
      });
    } catch (err) {
      // Race UNIQUE(owner, workspace, normalized_url). "existing" HARUS active — jangan
      // kembalikan id tombstone soft-deleted yang slot-nya belum dibebaskan worker cleanup.
      if ((err as { code?: string }).code === "23505") {
        const racer = await ArtifactUrlRepo.findByNormalizedUrl(
          db,
          input.ownerUserId,
          input.workspaceId,
          normalizedUrl,
        );
        if (racer) {
          const racerArt = await ArtifactRepo.findById(db, racer.artifactId);
          if (racerArt && racerArt.ownerUserId === input.ownerUserId && racerArt.status === "active") {
            return { artifactId: racerArt.id };
          }
          throwAppError({
            message: "Tautan ini sedang dihapus, coba lagi sebentar.",
            code: "artifact_url_pending_cleanup",
            severity: "warning",
            status: 409,
          });
        }
      }
      throw err;
    }

    await enqueue(ARTIFACT_QUEUES.urlIngestion, { ownerUserId: input.ownerUserId, artifactId });
    return { artifactId };
  },

  /** Re-queue ekstraksi URL (reset status pending + clear failure). */
  async retryUrlExtraction(
    db: Db,
    input: { ownerUserId: string; artifactId: string },
  ): Promise<{ ok: true }> {
    await db.transaction(async (tx) => {
      const artifact = await assertWorkspaceArtifact(tx, input.ownerUserId, input.artifactId);
      await WorkspaceService.assertWorkspaceOwner(tx, input.ownerUserId, artifact.workspaceId, {
        requireActive: true,
      });
      if (artifact.artifactType !== "url") {
        throwAppError({ message: "Artifact is not a URL", code: "artifact_not_url", severity: "warning" });
      }
      const urlRow = await ArtifactUrlRepo.findByArtifact(tx, input.ownerUserId, input.artifactId);
      if (!urlRow) {
        throwAppError({
          message: "URL artifact not found",
          code: "artifact_url_not_found",
          severity: "error",
          status: 404,
        });
      }
      const now = Date.now();
      await ArtifactRepo.update(tx, input.artifactId, {
        indexingStatus: "pending",
        indexingFailureReason: null,
        updatedAt: now,
      });
      await ArtifactUrlRepo.updateByArtifact(tx, input.artifactId, {
        status: "pending",
        failureReason: null,
        updatedAt: now,
      });
    });
    await enqueue(ARTIFACT_QUEUES.urlIngestion, {
      ownerUserId: input.ownerUserId,
      artifactId: input.artifactId,
    });
    return { ok: true };
  },

  // ===== URL-ingestion helpers (dipanggil worker `url-ingestion`) =====

  /** Target ingest URL (artifact url-type, aktif, workspace-scoped) atau null. */
  async getUrlIngestTarget(
    db: DbOrTx,
    ownerUserId: string,
    artifactId: string,
  ): Promise<{
    workspaceId: string;
    originalUrl: string;
    normalizedUrl: string;
    title: string;
    siteName: string;
  } | null> {
    const artifact = await ArtifactRepo.findById(db, artifactId);
    if (
      !artifact ||
      artifact.ownerUserId !== ownerUserId ||
      artifact.status !== "active" ||
      !artifact.workspaceId ||
      artifact.artifactType !== "url"
    ) {
      return null;
    }
    const urlRow = await ArtifactUrlRepo.findByArtifact(db, ownerUserId, artifactId);
    if (!urlRow) return null;
    return {
      workspaceId: artifact.workspaceId,
      originalUrl: urlRow.originalUrl,
      normalizedUrl: urlRow.normalizedUrl,
      title: artifact.title,
      siteName: urlRow.siteName ?? siteNameFromUrl(urlRow.normalizedUrl),
    };
  },

  /** Crawl generik selesai: simpan readableText (offload >limit), status ready. */
  async markUrlReady(
    db: Db,
    input: {
      ownerUserId: string;
      artifactId: string;
      title?: string;
      description?: string;
      siteName?: string;
      readableText: string;
    },
  ): Promise<void> {
    const existing = await ArtifactUrlRepo.findByArtifact(db, input.ownerUserId, input.artifactId);
    const readableKey = await StorageService.maybeOffloadText(
      input.ownerUserId,
      input.artifactId,
      "url",
      input.readableText,
      "text/markdown",
    );
    const now = Date.now();
    await db.transaction(async (tx) => {
      await ArtifactRepo.update(tx, input.artifactId, {
        indexingStatus: "ready",
        indexingFailureReason: null,
        plainTextPreview: previewFromText(input.readableText),
        ...(input.title ? { title: input.title } : {}),
        updatedAt: now,
      });
      await ArtifactUrlRepo.updateByArtifact(tx, input.artifactId, {
        status: "ready",
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.siteName !== undefined ? { siteName: input.siteName } : {}),
        readableText: readableKey ? null : input.readableText,
        readableTextR2Key: readableKey ?? null,
        contextText: contextFromText(input.readableText),
        extractedAt: now,
        updatedAt: now,
      });
    });
    await deleteStaleR2Keys([existing?.readableTextR2Key]);
  },

  /** Ingest URL gagal: status failed + failureReason. */
  async markUrlFailed(
    db: Db,
    input: { ownerUserId: string; artifactId: string; failureReason: string },
  ): Promise<void> {
    const reason = previewFromText(input.failureReason, 500);
    const now = Date.now();
    await db.transaction(async (tx) => {
      await ArtifactRepo.update(tx, input.artifactId, {
        indexingStatus: "failed",
        indexingFailureReason: reason,
        updatedAt: now,
      });
      await ArtifactUrlRepo.updateByArtifact(tx, input.artifactId, {
        status: "failed",
        failureReason: reason,
        updatedAt: now,
      });
    });
  },

  /** Paper scholarly tanpa OA PDF: tetap url-type, detectedKind scholarly, abstract sbg readable. */
  async markUrlPaperMetadataOnly(
    db: Db,
    input: {
      ownerUserId: string;
      artifactId: string;
      title?: string;
      abstract?: string;
      siteName?: string;
    },
  ): Promise<void> {
    const existing = await ArtifactUrlRepo.findByArtifact(db, input.ownerUserId, input.artifactId);
    const text = input.abstract ?? input.title ?? "";
    const readableKey = input.abstract
      ? await StorageService.maybeOffloadText(
          input.ownerUserId,
          input.artifactId,
          "url",
          input.abstract,
          "text/plain",
        )
      : undefined;
    const now = Date.now();
    await db.transaction(async (tx) => {
      await ArtifactRepo.update(tx, input.artifactId, {
        indexingStatus: "ready",
        indexingFailureReason: null,
        detectedDocumentKind: "scholarly_paper",
        plainTextPreview: previewFromText(text),
        ...(input.title ? { title: input.title } : {}),
        updatedAt: now,
      });
      await ArtifactUrlRepo.updateByArtifact(tx, input.artifactId, {
        status: "ready",
        ...(input.title !== undefined ? { title: input.title } : {}),
        description: input.abstract ? previewFromText(input.abstract, 280) : null,
        readableText: input.abstract ? (readableKey ? null : input.abstract) : null,
        readableTextR2Key: readableKey ?? null,
        ...(input.siteName !== undefined ? { siteName: input.siteName } : {}),
        extractedAt: now,
        updatedAt: now,
      });
    });
    await deleteStaleR2Keys([existing?.readableTextR2Key]);
  },

  /**
   * OA PDF resolved: simpan byte ke R2, ubah artifact url→pdf (detectedKind scholarly),
   * pastikan content row, mark url row ready (dedupe), lalu ekstrak+index. Metadata
   * ditulis worker via PaperMetadataService.
   */
  async ingestResolvedPdf(
    db: Db,
    input: {
      ownerUserId: string;
      artifactId: string;
      workspaceId: string;
      bytes: Uint8Array;
      byteSize: number;
      fileName: string;
      title?: string;
    },
  ): Promise<{ indexed: boolean }> {
    const urlBefore = await ArtifactUrlRepo.findByArtifact(db, input.ownerUserId, input.artifactId);
    const key = await StorageService.storeBytes(
      input.ownerUserId,
      input.artifactId,
      "paper",
      input.bytes,
      "application/pdf",
    );
    const now = Date.now();
    await db.transaction(async (tx) => {
      await ArtifactRepo.update(tx, input.artifactId, {
        artifactType: "pdf",
        artifactFamily: "file",
        mimeType: "application/pdf",
        fileName: input.fileName,
        byteSize: input.byteSize,
        storageR2Key: key,
        detectedDocumentKind: "scholarly_paper",
        indexingStatus: "pending",
        plainTextPreview: "Indexing is running.",
        ...(input.title ? { title: input.title } : {}),
        updatedAt: now,
      });
      const content = await ArtifactContentRepo.findByArtifact(tx, input.ownerUserId, input.artifactId);
      if (!content) {
        await ArtifactContentRepo.insert(tx, {
          id: crypto.randomUUID(),
          ownerUserId: input.ownerUserId,
          workspaceId: input.workspaceId,
          threadId: null,
          artifactId: input.artifactId,
          blocksJson: null,
          markdown: "",
          plainText: "",
          contextText: "",
          plainTextR2Key: null,
          blocksJsonR2Key: null,
          markdownR2Key: null,
          createdAt: now,
          updatedAt: now,
        });
      }
      // Pertahankan artifact_urls (dedupe) → ready.
      await ArtifactUrlRepo.updateByArtifact(tx, input.artifactId, {
        status: "ready",
        extractedAt: now,
        updatedAt: now,
      });
    });
    const { indexed } = await extractIndexAndPatch(db, {
      ownerUserId: input.ownerUserId,
      artifactId: input.artifactId,
      workspaceId: input.workspaceId,
      key,
      fileName: input.fileName,
      mimeType: "application/pdf",
      artifactType: "pdf",
      startedAt: now,
    });
    // Blob readable dari crawl generik sebelumnya (bila ada) kini usang.
    await deleteStaleR2Keys([urlBefore?.readableTextR2Key]);
    return { indexed };
  },

  /** Tandai artifact sebagai paper ilmiah (enrichment resolver/LLM sukses). */
  async markScholarly(db: DbOrTx, ownerUserId: string, artifactId: string): Promise<void> {
    const artifact = await ArtifactRepo.findById(db, artifactId);
    if (!artifact || artifact.ownerUserId !== ownerUserId) return;
    await ArtifactRepo.update(db, artifactId, {
      detectedDocumentKind: "scholarly_paper",
      updatedAt: Date.now(),
    });
  },

  /**
   * Detail artifact untuk reader. Soft: `null` bila tak ada / bukan milik user. Artifact HEADLESS
   * (`workspaceId=null`, mis. lampiran upload chat) tetap dikembalikan ke pemiliknya — reader panel
   * thread membukanya lewat id; `getRenderPayload` juga sudah headless-friendly. Ownership tetap gate.
   */
  async get(db: DbOrTx, ownerUserId: string, artifactId: string) {
    const artifact = await ArtifactRepo.findById(db, artifactId);
    if (!artifact || artifact.ownerUserId !== ownerUserId) return null;
    const content = await ArtifactContentRepo.findByArtifact(db, ownerUserId, artifactId);
    const url =
      artifact.artifactType === "url"
        ? await ArtifactUrlRepo.findByArtifact(db, ownerUserId, artifactId)
        : null;
    return {
      artifact: {
        ...toArtifactListItem(artifact),
        ragEntryId: artifact.ragEntryId,
        storageKey: artifact.storageR2Key,
      },
      content: toContentReadModel(content),
      url: toUrlReadModel(url),
    };
  },

  /** List artifact aktif workspace (opsional folder), keyset paginated. */
  async list(
    db: DbOrTx,
    ownerUserId: string,
    args: {
      workspaceId: string;
      folderId?: string;
      cursor?: string | null;
      limit?: number;
    },
  ): Promise<{ items: ArtifactListItem[]; nextCursor: string | null }> {
    await WorkspaceService.assertWorkspaceOwner(db, ownerUserId, args.workspaceId);
    if (args.folderId) {
      await FolderService.assertFolderOwner(db, ownerUserId, args.folderId, {
        workspaceId: args.workspaceId,
      });
    }
    const page = await ArtifactRepo.listActiveByWorkspace(db, {
      ownerUserId,
      workspaceId: args.workspaceId,
      folderId: args.folderId,
      limit: clampLimit(args.limit),
      cursor: decodeKeysetCursor(args.cursor),
    });
    return { items: page.items.map(toArtifactListItem), nextCursor: page.nextCursor };
  },

  /** Top-50 artifact aktif workspace untuk context picker (non-paginated). */
  async listForContextPicker(
    db: DbOrTx,
    ownerUserId: string,
    workspaceId: string,
  ): Promise<{ items: ArtifactListItem[] }> {
    await WorkspaceService.assertWorkspaceOwner(db, ownerUserId, workspaceId);
    const items = await ArtifactRepo.listActiveForContextPicker(db, ownerUserId, workspaceId);
    return { items: items.map(toArtifactListItem) };
  },

  /**
   * List artifact aktif yang terlampir pada sebuah thread (Slice 6.4, tool
   * `list_artifacts`). HEADLESS-TOLERANT: chat-attachment/agent `workspaceId=null`
   * tetap masuk (beda dari `list` yang workspace-scoped + assert). Tanpa assert
   * workspace; ownership di-enforce via filter `ownerUserId`.
   */
  async listByThread(
    db: DbOrTx,
    ownerUserId: string,
    threadId: string,
    limit = 50,
  ): Promise<ArtifactListItem[]> {
    const items = await ArtifactRepo.listByThread(db, ownerUserId, threadId, limit);
    return items.map(toArtifactListItem);
  },

  /**
   * Metadata satu artifact untuk tool agen (Slice 6.4, `get_artifact`).
   * HEADLESS-TOLERANT: owner + active saja (chat-attachment `workspaceId=null`
   * tetap resolve, beda dari `get` yang menuntut workspace). Return `null` bila
   * missing/not-owned/not-active.
   */
  async getForAgent(
    db: DbOrTx,
    ownerUserId: string,
    artifactId: string,
  ): Promise<ArtifactListItem | null> {
    const artifact = await ArtifactRepo.findById(db, artifactId);
    if (!artifact || artifact.ownerUserId !== ownerUserId || artifact.status !== "active") {
      return null;
    }
    return toArtifactListItem(artifact);
  },

  /**
   * Render payload (discriminated union on artifactType). Headless-tolerant: hanya
   * butuh owner + active (chat-attachment workspaceId=null tetap resolve). pdf/docx
   * → presigned R2 GET + `extractedText` (teks hasil indexing, agar agen bisa membaca
   * isinya tanpa parse PDF). Return `null` bila missing/not-owned/not-active/blob hilang.
   */
  async getRenderPayload(
    db: DbOrTx,
    ownerUserId: string,
    artifactId: string,
    opts?: { includeExtractedText?: boolean },
  ): Promise<ArtifactRenderPayload | null> {
    const artifact = await ArtifactRepo.findById(db, artifactId);
    if (!artifact || artifact.ownerUserId !== ownerUserId || artifact.status !== "active") return null;
    const type = artifact.artifactType as ArtifactType;

    if (type === "url") {
      const url = await ArtifactUrlRepo.findByArtifact(db, ownerUserId, artifactId);
      if (!url) return null;
      const readableText =
        url.readableText ??
        (url.readableTextR2Key ? await StorageService.readText(url.readableTextR2Key) : "");
      return {
        artifactType: "url",
        originalUrl: url.originalUrl,
        normalizedUrl: url.normalizedUrl,
        status: url.status as "pending" | "ready" | "failed",
        title: url.title ?? undefined,
        description: url.description ?? undefined,
        siteName: url.siteName ?? undefined,
        failureReason: url.failureReason ?? undefined,
        readableText,
      };
    }

    if (type === "pdf" || type === "docx" || type === "image") {
      if (!artifact.storageR2Key) return null;
      const signedUrl = await StorageService.getSignedReadUrl(artifact.storageR2Key);
      // pdf/docx: sertakan teks hasil ekstraksi indexing (inline / fallback R2) supaya agen bisa
      // membaca ISI dokumen — URL presigned saja tak dapat diparse agen (tak ada web_fetch). Hanya
      // saat diminta (`includeExtractedText`, dipakai tool agen) → viewer web tak terbebani ~ratusan
      // KB teks yang tak dipakainya. Image tak punya teks → biarkan kosong.
      let extractedText: string | undefined;
      if (opts?.includeExtractedText && type !== "image") {
        const content = await ArtifactContentRepo.findByArtifact(db, ownerUserId, artifactId);
        const resolved =
          content?.plainText ??
          (content?.plainTextR2Key ? await StorageService.readText(content.plainTextR2Key) : "");
        if (resolved.trim()) {
          extractedText =
            resolved.length > MAX_RENDER_EXTRACTED_TEXT_CHARS
              ? `${resolved.slice(0, MAX_RENDER_EXTRACTED_TEXT_CHARS)}\n\n[…teks dipotong karena dokumen panjang; bagian ini sudah cukup untuk ringkasan umum. Untuk detail bagian tertentu yang belum tercakup, panggil search_thread_documents (scope workspaceId) dengan kueri spesifik.]`
              : resolved;
        }
      }
      return {
        artifactType: type,
        fileName: artifact.fileName ?? artifact.title,
        mimeType: artifact.mimeType ?? "application/octet-stream",
        byteSize: artifact.byteSize ?? 0,
        url: signedUrl,
        indexingStatus: artifact.indexingStatus as IndexingStatus,
        ...(artifact.indexingFailureReason
          ? { indexingFailureReason: artifact.indexingFailureReason }
          : {}),
        ...(extractedText ? { extractedText } : {}),
      };
    }

    if (type === "markdown") {
      const content = await ArtifactContentRepo.findByArtifact(db, ownerUserId, artifactId);
      const blocksJson =
        content?.blocksJson != null
          ? JSON.stringify(content.blocksJson)
          : content?.blocksJsonR2Key
            ? await StorageService.readText(content.blocksJsonR2Key)
            : "";
      const markdown =
        content?.markdown ??
        (content?.markdownR2Key ? await StorageService.readText(content.markdownR2Key) : "");
      const plainText =
        content?.plainText ??
        (content?.plainTextR2Key ? await StorageService.readText(content.plainTextR2Key) : "");
      return { artifactType: "markdown", blocksJson, markdown, plainText };
    }

    const content = await ArtifactContentRepo.findByArtifact(db, ownerUserId, artifactId);
    const source =
      content?.plainText ??
      content?.markdown ??
      (content?.plainTextR2Key ? await StorageService.readText(content.plainTextR2Key) : "");
    return {
      artifactType: type as "plain_text" | "html" | "svg" | "mermaid" | "json" | "csv" | "code",
      source: source ?? "",
      ...(artifact.language ? { language: artifact.language } : {}),
    };
  },

  /**
   * Update dokumen Markdown (single-revision overwrite). Field > inline limit di-offload
   * ke R2 (offload = network, di luar tx; lalu patch dalam tx). Wajib markdown +
   * workspace non-archived + content row ada.
   */
  async updateDocument(
    db: Db,
    input: {
      ownerUserId: string;
      artifactId: string;
      title?: string;
      blocksJson?: string;
      markdown?: string;
      plainText: string;
    },
  ): Promise<{ ok: true }> {
    const artifact = await assertWorkspaceArtifact(db, input.ownerUserId, input.artifactId);
    await WorkspaceService.assertWorkspaceOwner(db, input.ownerUserId, artifact.workspaceId, {
      requireActive: true,
    });
    if (artifact.artifactType !== "markdown") {
      throwAppError({
        message: "Artifact is not editable Markdown",
        code: "artifact_not_editable_markdown",
        severity: "warning",
      });
    }
    const content = await ArtifactContentRepo.findByArtifact(db, input.ownerUserId, input.artifactId);
    if (!content) {
      throwAppError({
        message: "Artifact content not found",
        code: "artifact_content_not_found",
        severity: "error",
        status: 404,
      });
    }
    const title = input.title !== undefined ? normalizeArtifactTitle(input.title) : undefined;

    // Offload oversized (network) sebelum tx.
    const plainTextKey = await StorageService.maybeOffloadText(
      input.ownerUserId,
      input.artifactId,
      "plain",
      input.plainText,
      "text/plain",
    );
    let markdownKey: string | undefined;
    if (input.markdown !== undefined) {
      markdownKey = await StorageService.maybeOffloadText(
        input.ownerUserId,
        input.artifactId,
        "markdown",
        input.markdown,
        "text/markdown",
      );
    }
    let blocksValue: unknown = undefined;
    let blocksKey: string | null | undefined;
    if (input.blocksJson !== undefined) {
      if (input.blocksJson.length > ARTIFACT_BODY_INLINE_LIMIT) {
        blocksKey = await StorageService.storeText(
          input.ownerUserId,
          input.artifactId,
          "blocks",
          input.blocksJson,
          "application/json",
        );
        blocksValue = null;
      } else {
        blocksValue = input.blocksJson.trim() ? JSON.parse(input.blocksJson) : null;
        blocksKey = null;
      }
    }

    const now = Date.now();
    await db.transaction(async (tx) => {
      await ArtifactRepo.update(tx, input.artifactId, {
        ...(title !== undefined ? { title } : {}),
        plainTextPreview: previewFromText(input.plainText),
        indexingStatus: "ready",
        updatedAt: now,
      });
      await ArtifactContentRepo.updateByArtifact(tx, input.artifactId, {
        plainText: plainTextKey ? null : input.plainText,
        plainTextR2Key: plainTextKey ?? null,
        ...(input.markdown !== undefined
          ? { markdown: markdownKey ? null : input.markdown, markdownR2Key: markdownKey ?? null }
          : {}),
        ...(input.blocksJson !== undefined
          ? { blocksJson: blocksValue, blocksJsonR2Key: blocksKey ?? null }
          : {}),
        contextText: contextFromText(input.plainText),
        updatedAt: now,
      });
    });
    // Bersihkan blob versi lama yang baru saja ditimpa.
    await deleteStaleR2Keys([
      content.plainTextR2Key,
      ...(input.markdown !== undefined ? [content.markdownR2Key] : []),
      ...(input.blocksJson !== undefined ? [content.blocksJsonR2Key] : []),
    ]);
    return { ok: true };
  },

  /**
   * Rename + move dalam satu PATCH (kontrak 05). Workspace non-archived. Cross-workspace
   * move → cascade side-table (`syncArtifactWorkspaceMove`) + unfile bila folder tak
   * di-set.
   */
  async update(
    db: Db,
    input: {
      ownerUserId: string;
      artifactId: string;
      title?: string;
      targetWorkspaceId?: string;
      folderId?: string | null;
    },
  ): Promise<{ ok: true }> {
    const title = input.title !== undefined ? normalizeArtifactTitle(input.title) : undefined;
    const isMove = input.targetWorkspaceId !== undefined || input.folderId !== undefined;

    await db.transaction(async (tx) => {
      const artifact = await assertWorkspaceArtifact(tx, input.ownerUserId, input.artifactId);
      await WorkspaceService.assertWorkspaceOwner(tx, input.ownerUserId, artifact.workspaceId, {
        requireActive: true,
      });
      const now = Date.now();
      const patch: Partial<NewArtifact> = { updatedAt: now };
      if (title !== undefined) patch.title = title;

      let target = artifact.workspaceId;
      if (isMove) {
        target = input.targetWorkspaceId ?? artifact.workspaceId;
        if (target !== artifact.workspaceId) {
          await WorkspaceService.assertWorkspaceOwner(tx, input.ownerUserId, target, {
            requireActive: true,
          });
        }
        let newFolderId: string | null | undefined;
        if (input.folderId !== undefined) {
          newFolderId = input.folderId;
          if (newFolderId) {
            await FolderService.assertFolderOwner(tx, input.ownerUserId, newFolderId, {
              workspaceId: target,
            });
          }
        } else if (target !== artifact.workspaceId) {
          newFolderId = null; // cross-ws move tanpa folder → unfile
        }
        patch.workspaceId = target;
        if (newFolderId !== undefined) patch.folderId = newFolderId;
      }

      await ArtifactRepo.update(tx, input.artifactId, patch);
      if (isMove && target !== artifact.workspaceId) {
        await syncArtifactWorkspaceMove(tx, {
          artifactIds: [input.artifactId],
          targetWorkspaceId: target,
          now,
        });
      }
    }).catch((err) => {
      // Pindah URL ke workspace yang sudah punya URL sama → UNIQUE(owner,ws,normalized_url).
      if ((err as { code?: string }).code === "23505") {
        throwAppError({
          message: "Tautan ini sudah tersimpan di workspace tujuan.",
          code: "artifact_url_already_in_target_workspace",
          severity: "warning",
          status: 409,
        });
      }
      throw err;
    });
    return { ok: true };
  },

  /**
   * Soft-delete (status=deleted) + enqueue `artifact-cleanup` (hard-delete blob R2 +
   * embeddings + child rows — fix leak V1). Parent tetap tombstone. Workspace non-archived.
   */
  async remove(db: Db, input: { ownerUserId: string; artifactId: string }): Promise<{ ok: true }> {
    await db.transaction(async (tx) => {
      const artifact = await assertWorkspaceArtifact(tx, input.ownerUserId, input.artifactId);
      await WorkspaceService.assertWorkspaceOwner(tx, input.ownerUserId, artifact.workspaceId, {
        requireActive: true,
      });
      await softDeleteArtifactRow(tx, input.artifactId);
    });
    await enqueueArtifactCleanup(input.ownerUserId, input.artifactId);
    return { ok: true };
  },

  /**
   * Hapus lampiran thread (HEADLESS, `workspaceId=null`) — dipakai saat user mencabut chip
   * di composer SEBELUM kirim. Beda dari `remove` yang workspace-scoped: di sini ownership =
   * owner + artifact benar-benar lampiran upload milik thread ini (`source='upload'`,
   * `threadId` cocok). Soft-delete + enqueue cleanup. Idempoten (sudah hilang/non-aktif → no-op).
   */
  async removeThreadAttachment(
    db: Db,
    input: { ownerUserId: string; threadId: string; artifactId: string },
  ): Promise<{ ok: true }> {
    const artifact = await ArtifactRepo.findById(db, input.artifactId);
    // Idempoten: sudah hilang → no-op (mis. double-click / retry setelah sukses).
    if (!artifact) return { ok: true };
    // Bukan lampiran upload milik thread ini / milik owner lain → 404 (cegah numpang/hapus salah).
    if (
      artifact.ownerUserId !== input.ownerUserId ||
      artifact.threadId !== input.threadId ||
      artifact.source !== "upload"
    ) {
      throwAppError({
        message: "Attachment not found",
        code: "artifact_not_found",
        severity: "error",
        status: 404,
      });
    }
    // Sudah non-aktif (terhapus sebelumnya) → no-op idempoten, tak perlu update/enqueue ulang.
    if (artifact.status !== "active") return { ok: true };
    await softDeleteArtifactRow(db, input.artifactId);
    await enqueueArtifactCleanup(input.ownerUserId, input.artifactId);
    return { ok: true };
  },

  /**
   * Worker `artifact-cleanup`: FIX LEAK V1. Hard-delete blob R2 (semua `*_r2_key`) +
   * embeddings + child rows + parent setelah soft-delete. Idempotent (artifact sudah
   * hilang → no-op). R2 delete best-effort (log, jangan gagalkan).
   */
  async purgeArtifactStorage(db: Db, ownerUserId: string, artifactId: string): Promise<void> {
    const artifact = await ArtifactRepo.findById(db, artifactId);
    if (!artifact || artifact.ownerUserId !== ownerUserId) return;
    const content = await ArtifactContentRepo.findByArtifact(db, ownerUserId, artifactId);
    const urlRow = await ArtifactUrlRepo.findByArtifact(db, ownerUserId, artifactId);

    const keys = [
      artifact.storageR2Key,
      content?.plainTextR2Key,
      content?.blocksJsonR2Key,
      content?.markdownR2Key,
      urlRow?.readableTextR2Key,
    ].filter((k): k is string => Boolean(k));
    const failed: string[] = [];
    for (const key of keys) {
      try {
        await StorageService.deleteObject(key);
      } catch (err) {
        console.error("[artifact-cleanup] R2 delete failed", key, err);
        failed.push(key);
      }
    }
    // Row = satu-satunya pointer ke key. Kalau R2 belum bersih, JANGAN hapus row dulu —
    // throw supaya BullMQ retry (idempotent: row+key masih ada). Mencegah leak permanen
    // saat R2 sempat down (defeat-nya retry kalau di-swallow).
    if (failed.length > 0) {
      throw new Error(
        `[artifact-cleanup] ${failed.length} R2 delete(s) failed for ${artifactId}; retrying`,
      );
    }

    const ids = [artifactId];
    await db.transaction(async (tx) => {
      await ArtifactEmbeddingRepo.deleteByArtifactIds(tx, ids);
      await ArtifactContentRepo.deleteByArtifactIds(tx, ids);
      await ArtifactUrlRepo.deleteByArtifactIds(tx, ids);
      await ArtifactPaperMetadataRepo.deleteByArtifactIds(tx, ids);
      await ArtifactExtractionRepo.deleteByArtifactIds(tx, ids);
      await ArtifactRepo.deleteById(tx, artifactId);
    });
  },
};

const DEFAULT_LIST_LIMIT = 30;
const MAX_LIST_LIMIT = 100;
function clampLimit(limit: number | undefined): number {
  if (!limit || !Number.isFinite(limit)) return DEFAULT_LIST_LIMIT;
  return Math.max(1, Math.min(MAX_LIST_LIMIT, Math.floor(limit)));
}

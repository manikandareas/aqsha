import {
  ArtifactContentRepo,
  ArtifactExtractionRepo,
  ArtifactRepo,
  type Db,
} from "@aqsha/db";
import { RagService } from "../rag.service";
import { StorageService } from "../storage.service";
import { extractStoredDocument } from "./extract";
import {
  type ArtifactType,
  contextFromText,
  PAPER_ENRICHMENT_TEXT_CHARS,
  previewFromText,
} from "./model";

/**
 * Ekstraksi teks dari blob R2 (key) → offload >limit → RAG index → patch artifact
 * ready + content; gagal → failed. Tulis extraction row provenance (pdf/docx).
 * Shared `finalizeUpload` (upload) + url→pdf ingest. Network/CPU di luar tx.
 */
export async function extractIndexAndPatch(
  db: Db,
  args: {
    ownerUserId: string;
    artifactId: string;
    workspaceId: string | null;
    key: string;
    fileName: string;
    mimeType: string;
    artifactType: ArtifactType;
    startedAt: number;
  },
): Promise<{ indexed: boolean; enrichText: string | null }> {
  const isDoc = args.artifactType === "pdf" || args.artifactType === "docx";
  try {
    const bytes = await StorageService.readBytes(args.key);
    const { markdown, plainText } = await extractStoredDocument(bytes, args.fileName, args.mimeType);
    if (!plainText.trim()) throw new Error("No readable text was found in this file");
    // Index DULU (bisa throw): kalau gagal, jangan sampai sudah offload blob → orphan.
    const ragEntryId = await RagService.index(db, {
      ownerUserId: args.ownerUserId,
      artifactId: args.artifactId,
      workspaceId: args.workspaceId,
      text: plainText,
    });
    const markdownKey = await StorageService.maybeOffloadText(
      args.ownerUserId,
      args.artifactId,
      "markdown",
      markdown,
      "text/markdown",
    );
    const plainKey = await StorageService.maybeOffloadText(
      args.ownerUserId,
      args.artifactId,
      "plain",
      plainText,
      "text/plain",
    );
    const doneAt = Date.now();
    await db.transaction(async (tx) => {
      await ArtifactRepo.update(tx, args.artifactId, {
        indexingStatus: "ready",
        indexingFailureReason: null,
        ragEntryId,
        indexedAt: ragEntryId ? doneAt : null,
        plainTextPreview: previewFromText(plainText),
        updatedAt: doneAt,
      });
      await ArtifactContentRepo.updateByArtifact(tx, args.artifactId, {
        markdown: markdownKey ? null : markdown,
        markdownR2Key: markdownKey ?? null,
        plainText: plainKey ? null : plainText,
        plainTextR2Key: plainKey ?? null,
        contextText: contextFromText(plainText),
        updatedAt: doneAt,
      });
      if (isDoc) {
        await ArtifactExtractionRepo.insert(tx, {
          id: crypto.randomUUID(),
          ownerUserId: args.ownerUserId,
          artifactId: args.artifactId,
          workspaceId: args.workspaceId,
          extractor: args.artifactType === "pdf" ? "pdf_text" : "docx_text",
          status: "ready",
          failureReason: null,
          startedAt: args.startedAt,
          completedAt: doneAt,
          createdAt: doneAt,
          updatedAt: doneAt,
        });
      }
    });
    return { indexed: Boolean(ragEntryId), enrichText: plainText.slice(0, PAPER_ENRICHMENT_TEXT_CHARS) };
  } catch (err) {
    const reason = previewFromText(err instanceof Error ? err.message : "Extraction failed", 500);
    const failAt = Date.now();
    await db.transaction(async (tx) => {
      await ArtifactRepo.update(tx, args.artifactId, {
        indexingStatus: "failed",
        indexingFailureReason: reason,
        plainTextPreview: reason,
        updatedAt: failAt,
      });
      if (isDoc) {
        await ArtifactExtractionRepo.insert(tx, {
          id: crypto.randomUUID(),
          ownerUserId: args.ownerUserId,
          artifactId: args.artifactId,
          workspaceId: args.workspaceId,
          extractor: args.artifactType === "pdf" ? "pdf_text" : "docx_text",
          status: "failed",
          failureReason: reason,
          startedAt: args.startedAt,
          completedAt: failAt,
          createdAt: failAt,
          updatedAt: failAt,
        });
      }
    });
    return { indexed: false, enrichText: null };
  }
}

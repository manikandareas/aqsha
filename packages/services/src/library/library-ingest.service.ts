import { ArtifactRepo, type Citation, CitationRepo, type Db } from "@aqsha/db";
import { artifactFamilyForType } from "../artifacts/model";
import { ARTIFACT_QUEUES, enqueue, removeJob } from "../clients/queue";

export type LibraryIngestJob = { ownerUserId: string; citationId: string };

/** Teks fallback saat item belum punya PDF: cukup untuk satu chunk yang bermakna. */
function referenceText(citation: Citation): string {
  const authors = (citation.authorsJson ?? [])
    .map((a) => a.literal ?? [a.family, a.given].filter(Boolean).join(", "))
    .filter(Boolean)
    .join("; ");
  const abstract =
    typeof (citation.cslJson as { abstract?: unknown })?.abstract === "string"
      ? (citation.cslJson as { abstract: string }).abstract
      : "";
  return [citation.title, authors, citation.venue, citation.publishedYear, abstract]
    .filter(Boolean)
    .join("\n");
}

/** jobId stabil supaya enqueue ganda atas item yang sama tidak menggandakan kerja. */
function jobIdFor(citationId: string): string {
  return `${ARTIFACT_QUEUES.libraryIngest}:${citationId}`;
}

export const LibraryIngestService = {
  /**
   * Gerbang tunggal post-processing perpustakaan. Dipanggil tepat sesudah item
   * dibuat, dari jalur mana pun. Satu job per item — satu DOI busuk tidak boleh
   * menjatuhkan sisa batch import.
   */
  async enqueue(input: { ownerUserId: string; citationIds: string[] }): Promise<void> {
    for (const citationId of input.citationIds) {
      const jobId = jobIdFor(citationId);
      // BullMQ menahan job selesai/gagal (removeOnComplete/Fail), dan `add` dengan
      // jobId yang masih tertahan adalah no-op senyap — buang dulu agar re-ingest jalan.
      await removeJob(ARTIFACT_QUEUES.libraryIngest, jobId).catch(() => {});
      await enqueue(
        ARTIFACT_QUEUES.libraryIngest,
        { ownerUserId: input.ownerUserId, citationId } satisfies LibraryIngestJob,
        { jobId },
      );
    }
  },

  /**
   * Setiap item perpustakaan punya tepat satu artifact bayangan. Ia lahir sebagai
   * teks (judul, penulis, abstrak) dan di-upgrade menjadi PDF bila jalur open access
   * berhasil — sehingga embedding tetap satu tabel dan reader berlaku untuk item mana pun.
   */
  async ensureArtifact(db: Db, input: { ownerUserId: string; citation: Citation }): Promise<string> {
    if (input.citation.artifactId) return input.citation.artifactId;
    const artifactId = crypto.randomUUID();
    const now = Date.now();
    await ArtifactRepo.insert(db, {
      id: artifactId,
      ownerUserId: input.ownerUserId,
      workspaceId: null,
      folderId: null,
      threadId: null,
      artifactType: "plain_text",
      artifactFamily: artifactFamilyForType("plain_text"),
      source: "reference",
      title: input.citation.title,
      language: null,
      mimeType: null,
      fileName: null,
      byteSize: null,
      indexingStatus: "pending",
      indexingFailureReason: null,
      detectedDocumentKind: null,
      storageR2Key: null,
      contentVersion: null,
      ragEntryId: null,
      plainTextPreview: null,
      indexedAt: null,
      status: "active",
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await CitationRepo.updateById(db, input.citation.id, {
      artifactId,
      updatedAt: Date.now(),
    });
    return artifactId;
  },

  /**
   * State machine ingest. Idempoten: setiap langkah aman diulang, dan retry BullMQ
   * membaca ulang state dari DB alih-alih mempercayai payload job yang bisa basi.
   */
  async run(db: Db, job: LibraryIngestJob): Promise<void> {
    // `findById` sudah men-scope owner, jadi tak perlu memeriksa ownerUserId lagi.
    const citation = await CitationRepo.findById(db, job.ownerUserId, job.citationId);
    if (!citation || citation.deletedAt) return;

    await CitationRepo.updateById(db, citation.id, {
      ingestStatus: "processing",
      ingestError: null,
      updatedAt: Date.now(),
    });
    try {
      await this.ensureArtifact(db, { ownerUserId: job.ownerUserId, citation });
      await CitationRepo.updateById(db, citation.id, {
        ingestStatus: "ready",
        ingestedAt: Date.now(),
        ingestError: null,
        updatedAt: Date.now(),
      });
    } catch (error) {
      await CitationRepo.updateById(db, citation.id, {
        ingestStatus: "failed",
        ingestError: error instanceof Error ? error.message : "Ingest gagal",
        updatedAt: Date.now(),
      });
      throw error;
    }
  },
};

import {
  ArtifactRepo,
  type Citation,
  CitationRepo,
  type CitationTextCoverage,
  type Db,
} from "@aqsha/db";
import { ArtifactService } from "../artifact.service";
import { artifactFamilyForType } from "../artifacts/model";
import { ARTIFACT_QUEUES, enqueue, removeJob } from "../clients/queue";
import { PaperMetadataService } from "../paper-metadata.service";
import { downloadOaPdf, pdfFileName } from "../papers/download";
import { type ClassifiedUrl, classifyPaperText } from "../papers/identifiers";
import type { ResolvedPaper } from "../papers/model";
import { resolvePaper } from "../papers/resolve";
import { getRateLimiter } from "../quota/rate-limits";
import { RagService } from "../rag.service";

export type LibraryIngestJob = { ownerUserId: string; citationId: string };

/**
 * Judul unggahan lahir dari nama file, dan itu placeholder — bukan pilihan pengguna.
 * Tanpa pengecualian ini paper selamanya bernama `skripsi-final-v2.pdf`.
 */
function titleIsPlaceholder(citation: Citation): boolean {
  return citation.source === "artifact" && /\.(pdf|docx?)$/i.test(citation.title.trim());
}

function identifierFor(citation: Citation): ClassifiedUrl | null {
  const probe = [citation.doi, citation.url, citation.title].filter(Boolean).join("\n");
  return classifyPaperText(probe);
}

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
   * Best-effort: identifier tak ditemukan atau provider mati BUKAN kegagalan item.
   * Patch hanya field yang kosong supaya entri manual pengguna tak pernah tertimpa.
   * `resolve` dapat disuntik untuk pengujian.
   */
  async resolveMetadata(
    db: Db,
    input: {
      ownerUserId: string;
      citation: Citation;
      artifactId: string;
      resolve?: (classified: ClassifiedUrl) => Promise<ResolvedPaper | null>;
    },
  ): Promise<ResolvedPaper | null> {
    const classified = identifierFor(input.citation);
    if (!classified) return null;
    const run = input.resolve ?? ((c: ClassifiedUrl) => resolvePaper({ classified: c }));
    let resolved: ResolvedPaper | null = null;
    try {
      resolved = await run(classified);
    } catch {
      return null;
    }
    if (!resolved) return null;

    const patch: Record<string, unknown> = {};
    if (resolved.title && (!input.citation.title || titleIsPlaceholder(input.citation))) {
      patch.title = resolved.title;
    }
    if (resolved.doi && !input.citation.doi) patch.doi = resolved.doi;
    if (resolved.journal && !input.citation.venue) patch.venue = resolved.journal;
    if (resolved.publisher && !input.citation.publisher) patch.publisher = resolved.publisher;
    if (resolved.publishedYear && !input.citation.publishedYear) {
      patch.publishedYear = resolved.publishedYear;
    }
    if (resolved.authors.length > 0 && (input.citation.authorsJson ?? []).length === 0) {
      patch.authorsJson = resolved.authors.map((a) => ({ literal: a.name }));
    }
    if (Object.keys(patch).length > 0) {
      patch.metadataStatus = "verified";
      patch.updatedAt = Date.now();
      await CitationRepo.updateById(db, input.citation.id, patch);
    }

    await PaperMetadataService.upsert(db, {
      ownerUserId: input.ownerUserId,
      artifactId: input.artifactId,
      workspaceId: null,
      metadataSource: resolved.metadataSource,
      ...(resolved.title ? { title: resolved.title } : {}),
      ...(resolved.abstract ? { abstract: resolved.abstract } : {}),
      ...(resolved.doi ? { doi: resolved.doi } : {}),
      authors: resolved.authors,
      affiliations: resolved.affiliations,
      ...(resolved.journal ? { journal: resolved.journal } : {}),
      ...(resolved.publisher ? { publisher: resolved.publisher } : {}),
      ...(resolved.publishedYear ? { publishedYear: resolved.publishedYear } : {}),
      ...(resolved.arxivId ? { arxivId: resolved.arxivId } : {}),
      ...(resolved.landingPageUrl ? { sourceUrl: resolved.landingPageUrl } : {}),
      ...(resolved.oaStatus ? { oaStatus: resolved.oaStatus } : {}),
      confidence: 0.95,
    });
    return resolved;
  },

  /**
   * Best-effort: tak ada kandidat open access, unduhan gagal, atau host diblokir
   * penjaga SSRF semuanya berarti item tetap hidup dengan cakupan abstrak.
   */
  async fetchOpenAccessPdf(
    db: Db,
    input: {
      ownerUserId: string;
      citation: Citation;
      artifactId: string;
      resolved: ResolvedPaper;
      download?: typeof downloadOaPdf;
    },
  ): Promise<boolean> {
    const candidates = input.resolved.pdfCandidates ?? [];
    if (candidates.length === 0) return false;
    // Import besar melepas ratusan job sekaligus; tanpa gerbang ini satu akun bisa
    // memicu fan-out unduhan ke penerbit dalam hitungan detik. Kehabisan jatah bukan
    // kegagalan item — ia sekadar tidak jadi mengunduh kali ini.
    try {
      await getRateLimiter("library:oa-download").consume(input.ownerUserId, 1);
    } catch {
      return false;
    }
    const run = input.download ?? downloadOaPdf;
    let pdf: Awaited<ReturnType<typeof downloadOaPdf>> = null;
    try {
      pdf = await run({ candidates });
    } catch {
      return false;
    }
    if (!pdf) return false;
    await ArtifactService.ingestResolvedPdf(db, {
      ownerUserId: input.ownerUserId,
      artifactId: input.artifactId,
      workspaceId: null,
      bytes: pdf.bytes,
      byteSize: pdf.byteSize,
      fileName: pdfFileName(input.resolved),
      title: input.citation.title,
    });
    return true;
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
      const artifactId = await this.ensureArtifact(db, {
        ownerUserId: job.ownerUserId,
        citation,
      });
      const resolved = await this.resolveMetadata(db, {
        ownerUserId: job.ownerUserId,
        citation,
        artifactId,
      });
      const upgraded = resolved
        ? await this.fetchOpenAccessPdf(db, {
            ownerUserId: job.ownerUserId,
            citation,
            artifactId,
            resolved,
          })
        : false;

      // `ingestResolvedPdf` sudah mengekstrak dan meng-index teks penuh; jalur tanpa
      // PDF meng-embed satu chunk dari metadata supaya item tetap dapat ditemukan.
      let coverage: CitationTextCoverage = "full_text";
      if (!upgraded) {
        // Baca ulang: langkah resolve mungkin baru saja mengisi judul, penulis, dan
        // venue — teks yang di-embed harus versi terbarunya, bukan snapshot awal.
        const fresh = (await CitationRepo.findById(db, job.ownerUserId, citation.id)) ?? citation;
        const text = referenceText(fresh);
        const entry = await RagService.index(db, {
          ownerUserId: job.ownerUserId,
          artifactId,
          workspaceId: null,
          text,
        });
        coverage = entry ? "abstract" : "none";
      }

      await CitationRepo.updateById(db, citation.id, {
        ingestStatus: "ready",
        textCoverage: coverage,
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

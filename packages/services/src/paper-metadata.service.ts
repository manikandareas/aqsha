import {
  ArtifactPaperMetadataRepo,
  type DbOrTx,
  type NewArtifactPaperMetadata,
  type PaperAuthor,
} from "@aqsha/db";

/**
 * PaperMetadataService — satu writer untuk artifact_paper_metadata (upload enrichment
 * + url ingestion). Monotonik rank: `manual > resolver > llm` — TIDAK menurunkan
 * provenance lebih kaya dengan yang lebih lemah. Field-merge: hanya patch key yang
 * disuplai (jangan clobber field yang pass sebelumnya isi). Port V1
 * `upsertResolvedPaperMetadata` (GROBID di-drop).
 */
const METADATA_SOURCE_RANK: Record<string, number> = {
  manual: 4,
  crossref: 2,
  openalex: 2,
  arxiv: 2,
  datacite: 2,
  semantic_scholar: 2,
  llm: 1,
};

export type PaperMetadataInput = {
  ownerUserId: string;
  artifactId: string;
  /** Null = paper perpustakaan level akun, tidak dititipkan ke proyek mana pun. */
  workspaceId: string | null;
  metadataSource: string;
  title?: string;
  abstract?: string;
  doi?: string;
  authors?: PaperAuthor[];
  affiliations?: string[];
  keywords?: string[];
  journal?: string;
  publisher?: string;
  publishedYear?: number;
  arxivId?: string;
  sourceUrl?: string;
  oaStatus?: string;
  pdfStatus?: "downloaded" | "no_oa_available";
  confidence?: number;
};

export const PaperMetadataService = {
  async upsert(db: DbOrTx, input: PaperMetadataInput): Promise<{ ok: true }> {
    const existing = await ArtifactPaperMetadataRepo.findByArtifact(
      db,
      input.ownerUserId,
      input.artifactId,
    );
    if (
      existing &&
      (METADATA_SOURCE_RANK[input.metadataSource] ?? 0) <
        (METADATA_SOURCE_RANK[existing.metadataSource] ?? 0)
    ) {
      return { ok: true }; // jangan downgrade provenance
    }

    const now = Date.now();
    if (!existing) {
      await ArtifactPaperMetadataRepo.insert(db, {
        id: crypto.randomUUID(),
        ownerUserId: input.ownerUserId,
        artifactId: input.artifactId,
        workspaceId: input.workspaceId,
        metadataSource: input.metadataSource,
        title: input.title ?? null,
        abstract: input.abstract ?? null,
        doi: input.doi ?? null,
        authors: input.authors ?? [],
        affiliations: input.affiliations ?? [],
        keywords: input.keywords ?? [],
        journal: input.journal ?? null,
        publisher: input.publisher ?? null,
        publishedYear: input.publishedYear ?? null,
        arxivId: input.arxivId ?? null,
        sourceUrl: input.sourceUrl ?? null,
        oaStatus: input.oaStatus ?? null,
        pdfStatus: input.pdfStatus ?? null,
        confidence: input.confidence ?? null,
        createdAt: now,
        updatedAt: now,
      });
      return { ok: true };
    }

    // Field-merge: hanya key yang disuplai.
    const patch: Partial<NewArtifactPaperMetadata> = {
      metadataSource: input.metadataSource,
      updatedAt: now,
    };
    if (input.title !== undefined) patch.title = input.title;
    if (input.abstract !== undefined) patch.abstract = input.abstract;
    if (input.doi !== undefined) patch.doi = input.doi;
    if (input.authors !== undefined) patch.authors = input.authors;
    if (input.affiliations !== undefined) patch.affiliations = input.affiliations;
    if (input.keywords !== undefined) patch.keywords = input.keywords;
    if (input.journal !== undefined) patch.journal = input.journal;
    if (input.publisher !== undefined) patch.publisher = input.publisher;
    if (input.publishedYear !== undefined) patch.publishedYear = input.publishedYear;
    if (input.arxivId !== undefined) patch.arxivId = input.arxivId;
    if (input.sourceUrl !== undefined) patch.sourceUrl = input.sourceUrl;
    if (input.oaStatus !== undefined) patch.oaStatus = input.oaStatus;
    if (input.pdfStatus !== undefined) patch.pdfStatus = input.pdfStatus;
    if (input.confidence !== undefined) patch.confidence = input.confidence;
    await ArtifactPaperMetadataRepo.updateById(db, existing.id, patch);
    return { ok: true };
  },
};

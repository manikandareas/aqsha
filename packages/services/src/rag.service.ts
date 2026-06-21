import {
  ArtifactEmbeddingRepo,
  type DbOrTx,
  type NewArtifactEmbedding,
} from "@aqsha/db";
import { MAX_INDEXED_TEXT_CHARS } from "./artifacts/model";
import { embedTexts, isEmbeddingEnabled } from "./clients/embeddings";

/** Satu chunk dokumen yang relevan (untuk tool `search_thread_documents`). */
export type ThreadDocumentMatch = {
  artifactId: string;
  title: string;
  chunkIndex: number;
  content: string;
  /** Skor relevansi `[0..1]` (1 = paling mirip), diturunkan dari jarak cosine. */
  score: number;
};

/**
 * RagService — index teks artifact ke pgvector (`artifact_embeddings`). Chunk teks
 * (cap `MAX_INDEXED_TEXT_CHARS`) → embed (OpenAI-compatible, model+dimensi V1) →
 * upsert. `ragEntryId` = `artifact:<id>` (handle stabil untuk reindex/delete; fix
 * leak V1). Search (ANN HNSW) menyusul P6. Dipanggil di luar transaksi utama
 * (embed = network) — kelola write embedding sendiri.
 */
const CHUNK_SIZE = 2_000;
const CHUNK_OVERLAP = 200;

function chunkText(text: string): string[] {
  const sliced = text.slice(0, MAX_INDEXED_TEXT_CHARS);
  const chunks: string[] = [];
  let start = 0;
  while (start < sliced.length) {
    const end = Math.min(start + CHUNK_SIZE, sliced.length);
    const chunk = sliced.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= sliced.length) break;
    start = end - CHUNK_OVERLAP;
  }
  return chunks;
}

export function ragEntryIdFor(artifactId: string): string {
  return `artifact:${artifactId}`;
}

export const RagService = {
  /**
   * Index teks → embeddings. Return ragEntryId bila ter-index, atau `null` bila
   * embedding disabled / teks kosong (caller men-set `indexingStatus` sesuai).
   * Re-index: hapus embedding lama dulu (idempotent).
   */
  async index(
    db: DbOrTx,
    input: { ownerUserId: string; artifactId: string; workspaceId: string | null; text: string },
  ): Promise<string | null> {
    if (!isEmbeddingEnabled()) return null;
    const chunks = chunkText(input.text);
    if (chunks.length === 0) return null;
    const vectors = await embedTexts(chunks);
    const now = Date.now();
    await ArtifactEmbeddingRepo.deleteByArtifact(db, input.ownerUserId, input.artifactId);
    const rows: NewArtifactEmbedding[] = chunks.map((content, i) => ({
      id: crypto.randomUUID(),
      ownerUserId: input.ownerUserId,
      artifactId: input.artifactId,
      workspaceId: input.workspaceId,
      chunkIndex: i,
      content,
      embedding: vectors[i] ?? [],
      createdAt: now,
    }));
    await ArtifactEmbeddingRepo.insertMany(db, rows);
    return ragEntryIdFor(input.artifactId);
  },

  async deleteByArtifact(db: DbOrTx, ownerUserId: string, artifactId: string): Promise<void> {
    await ArtifactEmbeddingRepo.deleteByArtifact(db, ownerUserId, artifactId);
  },

  /**
   * RAG read (Slice 6.4) — embed query → ANN cosine search atas chunk artifact,
   * di-scope owner + (thread atau workspace). Degrade GRACEFUL bila embedding
   * disabled (mis. tanpa kredensial): return `[]` supaya tool tetap menjawab
   * "tidak ada dokumen relevan", bukan melempar. Jarak cosine `[0..2]` dipetakan
   * ke skor `[0..1]` (`1 - distance/2`).
   */
  async searchThreadDocuments(
    db: DbOrTx,
    input: {
      ownerUserId: string;
      threadId?: string;
      workspaceId?: string;
      query: string;
      limit?: number;
    },
  ): Promise<ThreadDocumentMatch[]> {
    const query = input.query.trim();
    if (!query || !isEmbeddingEnabled()) return [];
    const [vector] = await embedTexts([query]);
    if (!vector) return [];
    const matches = await ArtifactEmbeddingRepo.searchSimilar(db, {
      ownerUserId: input.ownerUserId,
      queryVector: vector,
      threadId: input.threadId,
      workspaceId: input.workspaceId,
      limit: Math.min(Math.max(input.limit ?? 6, 1), 20),
    });
    return matches.map((m) => ({
      artifactId: m.artifactId,
      title: m.title,
      chunkIndex: m.chunkIndex,
      content: m.content,
      score: Math.max(0, 1 - m.distance / 2),
    }));
  },
};

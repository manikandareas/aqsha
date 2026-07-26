import {
  ArtifactEmbeddingRepo,
  type DbOrTx,
  type NewArtifactEmbedding,
} from "@aqsha/db";
import { MAX_INDEXED_TEXT_CHARS } from "./artifacts/model";
import { assertEmbeddingEnabled, embedTexts, isEmbeddingEnabled } from "./clients/embeddings";

/**
 * Re-export fail-fast startup guard (D1) lewat subpath `@aqsha/services/rag` — dipanggil entry
 * runtime agent + api supaya kredensial embedding yang hilang gagal keras saat boot.
 */
export { assertEmbeddingEnabled };

/** Satu chunk dokumen yang relevan (untuk tool `search_thread_documents`). */
export type ThreadDocumentMatch = {
  artifactId: string;
  title: string;
  chunkIndex: number;
  content: string;
  /** Skor relevansi `[0..1]` (1 = paling mirip), diturunkan dari jarak cosine. */
  score: number;
  /** Terisi bila chunk berasal dari item perpustakaan. */
  citationId?: string;
  /**
   * Kunci `@key` hanya sah bila sudah ter-assign; saat null, pemanggil WAJIB
   * mengambilnya dari daftar referensi proyek agar tidak lahir sitasi yatim.
   */
  bibKey?: string;
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
    // Defensif: di prod, proses meng-index sudah `assertEmbeddingEnabled()` saat boot (D1), jadi
    // cabang ini tak terjangkau. Dipertahankan untuk konteks non-asserted (mis. unit test tanpa key).
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
   * RAG read (Slice 6.4 + D4 hybrid) — gabung pencarian VEKTOR (ANN cosine) dan LEKSIKAL (FTS
   * `websearch_to_tsquery`) atas chunk artifact, di-scope owner + (thread atau workspace), lalu
   * fusi via Reciprocal Rank Fusion. Hybrid menutup kelemahan vektor murni: kueri kaya kata-kunci
   * (nama, istilah, angka) yang meleset secara makna tetap tertangkap leksikal. Degrade GRACEFUL
   * bila embedding disabled: return `[]` (tool menjawab "tak ada dokumen relevan", bukan melempar).
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
    const limit = Math.min(Math.max(input.limit ?? 6, 1), 20);
    // Ambil lebih banyak kandidat per-jalur (limit×3) supaya RRF punya ruang re-rank.
    const candidates = Math.min(limit * 3, 50);
    const scope = {
      ownerUserId: input.ownerUserId,
      threadId: input.threadId,
      workspaceId: input.workspaceId,
    };
    const [vectorMatches, lexicalMatches] = await Promise.all([
      ArtifactEmbeddingRepo.searchSimilar(db, { ...scope, queryVector: vector, limit: candidates }),
      ArtifactEmbeddingRepo.searchLexical(db, { ...scope, query, limit: candidates }),
    ]);
    return fuseByReciprocalRank(vectorMatches, lexicalMatches, limit);
  },
};

/** Konstanta RRF standar; meredam dominasi rank-1 satu jalur (skor ≈ Σ 1/(K + rank)). */
const RRF_K = 60;

type RankedChunk = {
  artifactId: string;
  chunkIndex: number;
  content: string;
  title: string;
  citationId: string | null;
  bibKey: string | null;
};

/**
 * Reciprocal Rank Fusion: tiap chunk dapat skor Σ 1/(RRF_K + rank0) dari semua jalur yang
 * memunculkannya (rank 0-based). Chunk yang muncul di vektor DAN leksikal naik ke atas. Kunci
 * dedupe = `artifactId#chunkIndex`. Skor dikembalikan apa adanya (relatif, bukan [0..1]).
 */
function fuseByReciprocalRank(
  vectorMatches: readonly RankedChunk[],
  lexicalMatches: readonly RankedChunk[],
  limit: number,
): ThreadDocumentMatch[] {
  const fused = new Map<string, { chunk: RankedChunk; score: number }>();
  const accumulate = (list: readonly RankedChunk[]) => {
    list.forEach((chunk, rank) => {
      const key = `${chunk.artifactId}#${chunk.chunkIndex}`;
      const contribution = 1 / (RRF_K + rank);
      const existing = fused.get(key);
      if (existing) existing.score += contribution;
      else fused.set(key, { chunk, score: contribution });
    });
  };
  accumulate(vectorMatches);
  accumulate(lexicalMatches);
  return [...fused.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ chunk, score }) => ({
      artifactId: chunk.artifactId,
      title: chunk.title,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      score: Number(score.toFixed(4)),
      ...(chunk.citationId ? { citationId: chunk.citationId } : {}),
      ...(chunk.bibKey ? { bibKey: chunk.bibKey } : {}),
    }));
}

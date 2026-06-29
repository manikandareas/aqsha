import { createOpenAI } from "@ai-sdk/openai";
import { ARTIFACT_EMBEDDING_DIMENSION } from "@aqsha/db";
import { embedMany } from "ai";

/**
 * Embedding provider untuk RAG index (artifact_embeddings pgvector). DISAMAKAN
 * dengan V1: OpenAI-compatible, model `text-embedding-3-small`. INVARIANT: dimensi
 * embedding HARUS = kolom `artifact_embeddings.embedding` (`vector(1536)`), satu
 * sumber kebenaran `ARTIFACT_EMBEDDING_DIMENSION` di `@aqsha/db`. Kita teruskan
 * `dimensions` ke embedMany supaya model text-embedding-3-* menghasilkan tepat 1536
 * (bukan default model) — config model non-1536 akan gagal-keras di insert, bukan
 * silent-corrupt.
 */
export const EMBEDDING_MODEL =
  process.env.AQSHA_RAG_EMBEDDING_MODEL ?? "text-embedding-3-small";

export const EMBEDDING_DIMENSION = ARTIFACT_EMBEDDING_DIMENSION;

let provider: ReturnType<typeof createOpenAI> | null = null;

function getEmbeddingProvider() {
  if (provider) return provider;
  provider = createOpenAI({
    apiKey: process.env.AQSHA_EMBEDDING_API_KEY ?? process.env.OPENAI_API_KEY,
    baseURL: process.env.AQSHA_EMBEDDING_BASE_URL,
  });
  return provider;
}

/** True bila kredensial embedding tersedia (kalau tidak, RagService skip indexing). */
export function isEmbeddingEnabled(): boolean {
  return Boolean(process.env.AQSHA_EMBEDDING_API_KEY ?? process.env.OPENAI_API_KEY);
}

/**
 * Fail-fast startup (D1): kredensial embedding WAJIB di proses yang meng-index/mencari RAG
 * (api upload-finalize, worker indexing, agent `search_thread_documents`). Dipanggil di entry
 * runtime tiap proses tsb supaya kunci yang hilang gagal keras saat boot — bukan degradasi senyap
 * (upload "sukses" tapi tak ter-index, search selalu kosong). Embedding by default harus aktif.
 */
export function assertEmbeddingEnabled(): void {
  if (!isEmbeddingEnabled()) {
    throw new Error(
      "AQSHA_EMBEDDING_API_KEY (atau OPENAI_API_KEY) wajib: RAG embedding harus aktif. " +
        "Set kredensial embedding di environment proses ini sebelum start.",
    );
  }
}

export async function embedTexts(values: string[]): Promise<number[][]> {
  if (values.length === 0) return [];
  const { embeddings } = await embedMany({
    model: getEmbeddingProvider().textEmbeddingModel(EMBEDDING_MODEL),
    values,
    providerOptions: { openai: { dimensions: EMBEDDING_DIMENSION } },
  });
  return embeddings;
}

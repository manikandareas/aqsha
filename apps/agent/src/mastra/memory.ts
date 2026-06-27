import { fastembed } from "@mastra/fastembed";
import { Memory } from "@mastra/memory";
import { storage, vector } from "./storage";

/**
 * Mastra Memory = Source of Truth pesan/history Astra (menggantikan proyeksi eve:
 * `chat_thread_events` + B-strip + hook projection). Pesan tersimpan OTOMATIS saat
 * `agent.stream(msg, { memory: { thread, resource } })`; klien hanya mengirim pesan BARU,
 * Mastra memuat history dari storage.
 *
 * - `storage`/`vector`: dibagi dengan instance Mastra (satu Postgres, tabel `mastra_*`).
 * - `lastMessages`: jendela history non-semantik per turn.
 * - `semanticRecall`: tarik pesan relevan lintas-turn via embedding. Embedder = `fastembed`
 *   (BGE lokal, TANPA API key, lepas dari isu versi `EmbeddingModelV4`/`@ai-sdk/openai@4`
 *   yang ditolak Memory). Model di-unduh & di-cache saat init pertama. Index recall ini
 *   TERPISAH dari RAG dokumen app (`research_sources`).
 */
export const memory = new Memory({
  storage,
  vector,
  embedder: fastembed,
  options: {
    lastMessages: 10,
    semanticRecall: { topK: 3, messageRange: 2 },
    workingMemory: { enabled: false },
  },
});

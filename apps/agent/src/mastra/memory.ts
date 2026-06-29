import { fastembed } from "@mastra/fastembed";
import { Memory } from "@mastra/memory";
import type { AgentKind } from "./lib/tool-context";
import { storage, vector } from "./storage";

/**
 * Template working memory thread-scoped — ringkasan berjalan yang dipelihara model lintas-giliran
 * dalam SATU percakapan (mode tool-call `updateWorkingMemory`, dilipat ke system message). Menjaga
 * konteks implisit thread panjang tanpa harus membesarkan `lastMessages` berlebihan.
 */
const WORKING_MEMORY_TEMPLATE = `# Memori kerja percakapan
- **Tujuan / topik riset pengguna:**
- **Dokumen & artefak relevan (judul/artifactId):**
- **Preferensi pengguna (bahasa, gaya, format keluaran):**
- **Temuan & keputusan kunci sejauh ini:**
- **Langkah berikutnya / pertanyaan yang masih terbuka:**`;

/**
 * Mastra Memory = Source of Truth pesan/history Astra (menggantikan proyeksi eve:
 * `chat_thread_events` + B-strip + hook projection). Pesan tersimpan OTOMATIS saat
 * `agent.stream(msg, { memory: { thread, resource } })`; klien hanya mengirim pesan BARU,
 * Mastra memuat history dari storage.
 *
 * - `storage`/`vector`: dibagi dengan instance Mastra (satu Postgres, tabel `mastra_*`).
 * - `lastMessages` (16): jendela history non-semantik per turn (~8 giliran verbatim).
 * - `semanticRecall`: tarik pesan relevan lintas-turn via embedding. `topK: 6` hit ×
 *   `messageRange: 2` (2 pesan sebelum+sesudah tiap hit) → hingga ~30 pesan recall.
 *   `scope: "thread"` EKSPLISIT: default Mastra = `"resource"` (lintas-thread); kita kunci ke
 *   thread aktif sesuai keputusan produk (tak ada recall antar-percakapan). Embedder = `fastembed`
 *   (BGE lokal, TANPA API key, lepas dari isu versi `EmbeddingModelV4`/`@ai-sdk/openai@4` yang
 *   ditolak Memory). Index recall ini TERPISAH dari RAG dokumen app (`research_sources`).
 * - `workingMemory` (thread-scoped): ringkasan berjalan per-percakapan; biaya = 1 tool + sedikit
 *   token/latensi per turn, ditebus konteks thread panjang yang lebih stabil.
 *
 * Anggaran token aman: `TokenLimiterProcessor` membatasi input ~96k (75% dari 128k); worst-case
 * memory (16 + ~30 pesan) ≈ 40–50k token → menyisakan ruang untuk instruksi, tool result, output.
 *
 * Tier **Pro** memperdalam recall (jendela history + hit semantik lebih besar) untuk konteks thread
 * yang lebih kaya — `scope: "thread"` TETAP (keputusan produk: tak ada recall lintas-percakapan).
 * Storage/vector/embedder dibagi → pesan lite & pro hidup di tabel `mastra_*` yang sama.
 */
/**
 * Bangun Memory per-tier (storage/vector/embedder + working-memory bersama; hanya knob recall —
 * `lastMessages` + `semanticRecall` — yang berbeda per tier).
 */
export function createMemory(tier: AgentKind): Memory {
  const recall =
    tier === "pro"
      ? { lastMessages: 32, semanticRecall: { topK: 12, messageRange: 3, scope: "thread" as const } }
      : { lastMessages: 16, semanticRecall: { topK: 6, messageRange: 2, scope: "thread" as const } };
  return new Memory({
    storage,
    vector,
    embedder: fastembed,
    options: {
      ...recall,
      workingMemory: { enabled: true, scope: "thread", template: WORKING_MEMORY_TEMPLATE },
    },
  });
}

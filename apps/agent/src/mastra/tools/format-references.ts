import {
  dedupeReferenceSources,
  formatApa7Reference,
  ResearchService,
  sortForReferenceList,
} from "@aqsha/services/research";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getServiceDb } from "../lib/db";
import { threadScopeId } from "../lib/tool-context";

/**
 * format_references — daftar pustaka APA 7 DETERMINISTIK dari `research_sources` percakapan ini
 * (FEAT-3). READ murni (tanpa approval, tanpa debit — data sudah dibayar saat search). Server
 * yang memformat dari metadata provider asli → penulis/tahun/venue TIDAK dikarang model; entri
 * yang dikembalikan disalin verbatim. Sumber tanpa metadata (web) tetap difilter masuk dengan
 * pola fallback judul+URL. Ekspor file (.bib/.ris) dilayani route API terpisah, bukan tool ini.
 */
export const formatReferences = createTool({
  id: "format_references",
  description:
    "Susun daftar pustaka APA 7 dari sumber-sumber riset percakapan ini secara DETERMINISTIK (diformat server dari metadata asli — bukan dari ingatanmu). Panggil saat user minta daftar pustaka/referensi, atau sebelum menutup laporan bersitasi. Salin entri hasil tool VERBATIM (jangan menulis ulang penulis/tahun). Opsional: batasi ke nomor sitasi [n] tertentu.",
  inputSchema: z.object({
    citations: z
      .array(z.number().int().min(1))
      .max(200)
      .optional()
      .describe("Nomor sitasi [n] yang mau dimasukkan. Kosongkan untuk SEMUA sumber percakapan."),
  }),
  execute: async (input, ctx) => {
    const threadId = threadScopeId(ctx);
    const items = await ResearchService.listThreadSources(getServiceDb(), threadId);
    if (items.length === 0) {
      return {
        references: [],
        note: "Belum ada sumber riset yang terkumpul di percakapan ini — jalankan pencarian dulu.",
      };
    }
    const wanted = input.citations && input.citations.length > 0 ? new Set(input.citations) : null;
    const deduped = dedupeReferenceSources(items).filter(
      (s) => !wanted || (s.citationNumber !== null && wanted.has(s.citationNumber)),
    );
    if (deduped.length === 0) {
      return {
        references: [],
        note: "Tidak ada sumber yang cocok dengan nomor sitasi yang diminta.",
      };
    }
    const missing = wanted
      ? [...wanted].filter((n) => !deduped.some((s) => s.citationNumber === n))
      : [];
    return {
      style: "APA 7" as const,
      references: sortForReferenceList(deduped).map((s) => ({
        ...(s.citationNumber !== null ? { n: s.citationNumber } : {}),
        text: formatApa7Reference(s),
        // Metadata mentah ikut serta agar model bisa menyesuaikan gaya lain (IEEE dll.) TANPA mengarang.
        ...(s.authors.length > 0 ? { authors: s.authors } : {}),
        ...(s.year !== null ? { year: s.year } : {}),
        ...(s.venue !== null ? { venue: s.venue } : {}),
        ...(s.doi ? { doi: s.doi } : {}),
        ...(s.url ? { url: s.url } : {}),
      })),
      ...(missing.length > 0
        ? { note: `Nomor sitasi tanpa sumber tercatat: ${missing.join(", ")}.` }
        : {}),
    };
  },
});

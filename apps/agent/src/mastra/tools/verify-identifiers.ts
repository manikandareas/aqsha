import { CitationService } from "@aqsha/services/research";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { chargeToolUsage } from "../lib/research";
import { callerId } from "../lib/tool-context";

/**
 * verify_identifiers — verifikasi integritas SATU daftar referensi (existence, konsistensi
 * metadata, validitas DOI/arXiv) tanpa dokumen jadi. READ, tanpa approval. Panggil SEKALI atas
 * seluruh daftar (batch concurrency di server). Verdict di-keyed `[n]`. Debit `citation_verify`
 * (0 kredit).
 */
const VerifyItem = z.object({
  title: z.string().min(1).describe("Judul referensi."),
  doi: z.string().optional().describe("DOI bila ada."),
  arxivId: z.string().optional().describe("arXiv id bila ada."),
  authors: z.array(z.string()).optional().describe("Penulis (untuk cek konsistensi)."),
  year: z.number().optional().describe("Tahun terbit."),
  venue: z.string().optional().describe("Jurnal/venue."),
  citation: z.number().optional().describe("Nomor sitasi [n] — dikembalikan apa adanya."),
});

export const verifyIdentifiers = createTool({
  id: "verify_identifiers",
  description:
    "Verifikasi satu daftar referensi (keberadaan, konsistensi metadata, validitas DOI/arXiv) TANPA dokumen jadi. Panggil SEKALI dengan seluruh daftar; sertakan nomor [n] tiap referensi untuk mendapat verdict yang ter-keyed [n]. Jangan verifikasi satu-per-satu, jangan search web.",
  inputSchema: z.object({
    references: z.array(VerifyItem).min(1).max(CitationService.MAX_CITATIONS),
  }),
  execute: async (input, ctx) => {
    const ownerUserId = callerId(ctx);
    // CFG-7: hormati hasil gate — `citation_verify` berrate 0 hari ini (selalu ok), tapi bila
    // suatu saat diberi rate, kuota habis TIDAK boleh tetap menjalankan verifikasi.
    const charged = await chargeToolUsage(ctx, {
      ownerUserId,
      feature: "citation_verify",
      tool: "verify_identifiers",
      provider: "crossref",
    });
    if (!charged) {
      return {
        error: "quota_exhausted" as const,
        note: "Verifikasi TIDAK dijalankan: kuota fitur verifikasi sitasi habis untuk periode ini.",
      };
    }
    return CitationService.verifyIdentifiers(input.references);
  },
});

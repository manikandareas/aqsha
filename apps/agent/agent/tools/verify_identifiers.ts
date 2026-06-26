import { CitationService } from "@aqsha/services/research";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { callerId, chargeToolUsage } from "../lib/tools.ts";

/**
 * verify_identifiers (Slice 7.2) — verifikasi integritas SATU daftar referensi
 * (existence, konsistensi metadata, validitas DOI/arXiv) tanpa dokumen jadi. READ,
 * tanpa approval. Panggil SEKALI atas seluruh daftar (engine batch concurrency 4 di
 * server) — JANGAN one-by-one, JANGAN search web. Verdict di-keyed `[n]` (citation)
 * dan dikembalikan apa adanya. Debit `citation_verify` (0 kredit → selalu ok, hanya
 * rekam ledger/rollup untuk observability).
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

export default defineTool({
  description:
    "Verifikasi satu daftar referensi (keberadaan, konsistensi metadata, validitas DOI/arXiv) TANPA dokumen jadi. Panggil SEKALI dengan seluruh daftar; sertakan nomor [n] tiap referensi untuk mendapat verdict yang ter-keyed [n]. Jangan verifikasi satu-per-satu, jangan search web.",
  inputSchema: z.object({
    references: z.array(VerifyItem).min(1).max(CitationService.MAX_CITATIONS),
  }),
  async execute(input, ctx) {
    const ownerUserId = callerId(ctx);
    await chargeToolUsage(ctx, {
      ownerUserId,
      feature: "citation_verify",
      tool: "verify_identifiers",
      provider: "crossref",
      idemSuffix: String(input.references.length),
    });
    return CitationService.verifyIdentifiers(input.references);
  },
});

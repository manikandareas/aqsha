import { CitationService } from "@aqsha/services/research";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { chargeToolUsage } from "../lib/research";
import { callerId } from "../lib/tool-context";

/**
 * verify_citations — ekstrak bibliografi dari teks dokumen jadi, lalu verifikasi tiap
 * referensi (existence, konsistensi metadata, validitas DOI/arXiv). READ, tanpa approval.
 * Debit `citation_verify` (0 kredit → selalu ok, hanya rekam usage).
 */
export const verifyCitations = createTool({
  id: "verify_citations",
  description:
    "Verifikasi bibliografi sebuah dokumen: keberadaan, konsistensi metadata, dan validitas DOI/arXiv per referensi. Oper teks dokumen jadi (yang memuat bagian Referensi/Daftar Pustaka).",
  inputSchema: z.object({
    artifactText: z.string().min(1).describe("Teks dokumen jadi dengan bagian referensi."),
  }),
  execute: async (input, ctx) => {
    const ownerUserId = callerId(ctx);
    // CFG-7: hormati hasil gate — `citation_verify` berrate 0 hari ini (selalu ok), tapi bila
    // suatu saat diberi rate, kuota habis TIDAK boleh tetap menjalankan verifikasi.
    const charged = await chargeToolUsage(ctx, {
      ownerUserId,
      feature: "citation_verify",
      tool: "verify_citations",
      provider: "crossref",
    });
    if (!charged) {
      return {
        error: "quota_exhausted" as const,
        note: "Verifikasi TIDAK dijalankan: kuota fitur verifikasi sitasi habis untuk periode ini.",
      };
    }
    return CitationService.verifyCitations(input.artifactText);
  },
});

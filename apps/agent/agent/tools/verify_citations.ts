import { CitationService } from "@aqsha/services/research";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { callerId, chargeToolUsage } from "../lib/tools.ts";

/**
 * verify_citations (Slice 7.2) — ekstrak bibliografi dari teks dokumen jadi (bagian
 * "References"/"Daftar Pustaka"), lalu verifikasi tiap referensi (engine sama dengan
 * verify_identifiers). READ, tanpa approval. Pakai pada DRAFT jawaban tercitasi untuk
 * memeriksa integritas sitasi sebelum finalisasi. Debit `citation_verify` (0 kredit).
 */
export default defineTool({
  description:
    "Verifikasi bibliografi sebuah dokumen: keberadaan, konsistensi metadata, dan validitas DOI/arXiv per referensi. Oper teks dokumen jadi (yang memuat bagian Referensi/Daftar Pustaka).",
  inputSchema: z.object({
    artifactText: z.string().min(1).describe("Teks dokumen jadi dengan bagian referensi."),
  }),
  async execute(input, ctx) {
    const ownerUserId = callerId(ctx);
    await chargeToolUsage(ctx, {
      ownerUserId,
      feature: "citation_verify",
      tool: "verify_citations",
      provider: "crossref",
      idemSuffix: String(input.artifactText.length),
    });
    return CitationService.verifyCitations(input.artifactText);
  },
});

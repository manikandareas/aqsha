import { ArtifactService } from "@aqsha/services/artifact";
import { CitationService } from "@aqsha/services/research";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getServiceDb } from "../lib/db";
import { chargeToolUsage } from "../lib/research";
import { callerId } from "../lib/tool-context";

/**
 * verify_citations — ekstrak bibliografi dari teks dokumen jadi, lalu verifikasi tiap
 * referensi (existence, konsistensi metadata, validitas DOI/arXiv). READ, tanpa approval.
 * Debit `citation_verify` (0 kredit → selalu ok, hanya rekam usage).
 *
 * IMP-4: terima `artifactId` — teks dimuat SERVER-SIDE via `ArtifactService.getFullPlainText`
 * (tanpa cap render 80k yang memotong ekor dokumen tempat daftar pustaka berada), sehingga model
 * tak perlu memutar full-text lewat argumen tool (hemat token, bebas truncation). `artifactText`
 * dipertahankan untuk teks yang belum jadi artifact (mis. draf di percakapan).
 */
export const verifyCitations = createTool({
  id: "verify_citations",
  description:
    "Verifikasi bibliografi sebuah dokumen: keberadaan, konsistensi metadata, dan validitas DOI/arXiv per referensi. UTAMAKAN oper `artifactId` (teks dimuat server-side, tak perlu get_render_payload dulu); `artifactText` hanya untuk teks yang belum tersimpan sebagai artifact.",
  inputSchema: z
    .object({
      artifactId: z
        .string()
        .min(1)
        .optional()
        .describe("Id artifact dokumen (dari konteks tersemat / list_artifacts) — cara UTAMA."),
      artifactText: z
        .string()
        .min(1)
        .optional()
        .describe("Teks dokumen jadi dengan bagian referensi — hanya bila tak ada artifactId."),
    })
    .refine((v) => v.artifactId || v.artifactText, {
      message: "Wajib salah satu: artifactId atau artifactText.",
    }),
  execute: async (input, ctx) => {
    const ownerUserId = callerId(ctx);
    let text = input.artifactText ?? "";
    if (input.artifactId) {
      const loaded = await ArtifactService.getFullPlainText(
        getServiceDb(),
        ownerUserId,
        input.artifactId,
      );
      if (!loaded?.trim()) {
        return {
          error: "artifact_not_readable" as const,
          note: "Artifact tidak ditemukan / bukan milik user / tidak punya teks yang bisa dibaca (mis. image atau belum terindeks). Verifikasi TIDAK dijalankan.",
        };
      }
      text = loaded;
    }
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
    return CitationService.verifyCitations(text);
  },
});

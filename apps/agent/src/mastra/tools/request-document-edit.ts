import { DocAiService } from "@aqsha/services/doc-ai";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getServiceDb } from "../lib/db";
import { callerId } from "../lib/tool-context";

/**
 * request_document_edit — SINYAL (bukan penerapan, TANPA write DB). Memberi tahu klien bahwa
 * pengguna ingin menyunting dokumen Markdown yang sedang dibuka dengan AI. Klien (panel Astra di
 * reader artifact) menangkap sinyal ini lewat stream chat → memicu AI editor native BlockNote
 * (`invokeAI`) di dokumen terbuka; hasilnya tampil sebagai diff yang ditinjau pengguna
 * (Accept/Reject). Bila dokumen yang dimaksud tidak sedang terbuka, klien menampilkan affordance
 * "buka dokumen untuk menerapkan".
 *
 * Validasi ownership + tipe markdown di sini supaya sinyal tepercaya; penyuntingan + billing tetap
 * dijaga route `/blocknote-ai/chat` saat AI editor benar-benar berjalan. READ-only, tanpa debit.
 */
export const requestDocumentEdit = createTool({
  id: "request_document_edit",
  description:
    "Picu AI editor native pada dokumen yang sedang dibuka pengguna untuk menerapkan sebuah penyuntingan (mis. 'ringkas paragraf intro', 'perbaiki kalimat ini'). Ini SINYAL ke editor — perubahan muncul sebagai diff yang ditinjau pengguna (Accept/Reject) di dokumen, BUKAN diterapkan langsung. Pakai hanya untuk artifact dokumen (markdown) milik pengguna; sertakan instruksi penyuntingan yang jelas dan ringkas. JANGAN klaim dokumen sudah berubah — minta pengguna meninjau diff di editor.",
  inputSchema: z.object({
    artifactId: z.string().min(1).describe("Id artifact dokumen (markdown) yang akan disunting."),
    instruction: z
      .string()
      .min(1)
      .describe("Instruksi penyuntingan untuk AI editor, mis. 'Ringkas paragraf intro jadi 2 kalimat'."),
  }),
  execute: async (input, ctx) => {
    const ownerUserId = callerId(ctx);
    // Gerbang SAMA dengan route `/blocknote-ai/chat` (`assertEditableArtifact`: cheap `findById` →
    // cek milik + status aktif + tipe markdown) supaya sinyal & penerapan tak divergen, dan tak perlu
    // memuat konten penuh (getRenderPayload) hanya untuk membaca tipe. Throw → balas ok:false anggun.
    try {
      await DocAiService.assertEditableArtifact(getServiceDb(), ownerUserId, input.artifactId);
    } catch {
      return {
        ok: false as const,
        reason: "not_editable" as const,
        message:
          "Artifact tidak ditemukan atau bukan dokumen yang bisa disunting AI. Pastikan dokumen markdown milik pengguna.",
      };
    }
    return {
      ok: true as const,
      signal: "request_document_edit" as const,
      artifactId: input.artifactId,
      instruction: input.instruction,
    };
  },
});

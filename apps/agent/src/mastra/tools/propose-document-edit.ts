import { ChatThreadRepo } from "@aqsha/db";
import { DocumentProposalService } from "@aqsha/services/typst";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getServiceDb } from "../lib/db";
import { callerId, threadScopeId } from "../lib/tool-context";

/**
 * propose_document_edit — WRITE. Usulkan suntingan sumber Typst dokumen proyek (proyek implisit
 * dari scope thread). Server memvalidasi lewat dry-run compile: `ok:false compile_error` =
 * perbaiki sendiri lalu panggil ulang (self-repair); `ok:false edit_mismatch` = anchor salah,
 * baca ulang sumber. `ok:true` = proposal menunggu keputusan user (Terima/Tolak) — JANGAN klaim
 * dokumen sudah berubah.
 */
export const proposeDocumentEdit = createTool({
  id: "propose_document_edit",
  description:
    "Usulkan suntingan sumber Typst dokumen proyek. Untuk suntingan terarah kirim `edits` (pasangan oldText→newText; oldText = kutipan PERSIS & UNIK dari sumber terkini). Untuk menulis dari kosong / tulis-ulang menyeluruh kirim `fullSource`. Tulis Typst: heading bab `= Judul`, sitasi `@key`, JANGAN menulis preamble (dokumen sudah punya #set). Usulan divalidasi compile di server: bila gagal, perbaiki dan panggil ulang. Bila berhasil, user meninjau diff dan memutuskan — jangan klaim perubahan sudah diterapkan.",
  inputSchema: z.object({
    edits: z
      .array(
        z.object({
          oldText: z.string().min(1).describe("Kutipan persis & unik dari sumber terkini."),
          newText: z.string().describe("Teks pengganti Typst (boleh kosong untuk menghapus)."),
        }),
      )
      .max(32)
      .optional()
      .describe("Suntingan terarah; pakai INI bila dokumen sudah berisi."),
    fullSource: z
      .string()
      .optional()
      .describe("Sumber Typst lengkap pengganti — hanya untuk dokumen kosong / tulis-ulang total."),
    summary: z
      .string()
      .min(1)
      .max(500)
      .describe("Ringkasan perubahan untuk user (bahasa Indonesia, 1-2 kalimat)."),
    respondsToAnnotationIds: z
      .array(z.string())
      .max(64)
      .optional()
      .describe("Id anotasi yang dijawab suntingan ini (dari konteks pesan / get_document_source)."),
  }),
  execute: async (input, ctx) => {
    const ownerUserId = callerId(ctx);
    const db = getServiceDb();
    const thread = await ChatThreadRepo.findById(db, threadScopeId(ctx));
    if (!thread || thread.ownerUserId !== ownerUserId) {
      return {
        ok: false as const,
        reason: "edit_mismatch" as const,
        message: "Proyek thread ini tidak ditemukan.",
      };
    }
    return DocumentProposalService.propose(db, {
      ownerUserId,
      workspaceId: thread.workspaceId,
      edits: input.edits,
      fullSource: input.fullSource,
      summary: input.summary,
      respondsToAnnotationIds: input.respondsToAnnotationIds,
      threadId: threadScopeId(ctx),
    });
  },
});

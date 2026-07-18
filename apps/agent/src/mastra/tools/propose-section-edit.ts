import { SectionProposalService } from "@aqsha/services/latex";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getServiceDb } from "../lib/db";
import { callerId, threadScopeId } from "../lib/tool-context";

/**
 * propose_section_edit — WRITE. Usulkan suntingan sumber LaTeX bab. Server memvalidasi lewat
 * dry-run compile: `ok:false compile_error` = perbaiki sendiri lalu panggil ulang (self-repair);
 * `ok:false edit_mismatch` = anchor salah, baca ulang sumber. `ok:true` = proposal menunggu
 * keputusan user (Terima/Tolak) di halaman bab — JANGAN klaim dokumen sudah berubah.
 */
export const proposeSectionEdit = createTool({
  id: "propose_section_edit",
  description:
    "Usulkan suntingan sumber LaTeX satu bab. Untuk suntingan terarah kirim `edits` (pasangan oldText→newText; oldText = kutipan PERSIS & UNIK dari sumber terkini). Untuk menulis bab dari kosong / tulis-ulang menyeluruh kirim `fullSource`. Usulan divalidasi compile di server: bila gagal, perbaiki dan panggil ulang. Bila berhasil, user meninjau diff dan memutuskan — jangan klaim perubahan sudah diterapkan; minta user meninjau di halaman bab.",
  inputSchema: z.object({
    sectionId: z.string().min(1).describe("Id bab yang disunting."),
    edits: z
      .array(
        z.object({
          oldText: z.string().min(1).describe("Kutipan persis & unik dari sumber terkini."),
          newText: z.string().describe("Teks pengganti (boleh kosong untuk menghapus)."),
        }),
      )
      .max(32)
      .optional()
      .describe("Suntingan terarah; pakai INI bila bab sudah berisi."),
    fullSource: z
      .string()
      .optional()
      .describe("Sumber lengkap pengganti — hanya untuk bab kosong / tulis-ulang total."),
    summary: z
      .string()
      .min(1)
      .max(500)
      .describe("Ringkasan perubahan untuk user (bahasa Indonesia, 1-2 kalimat)."),
    respondsToAnnotationIds: z
      .array(z.string())
      .max(64)
      .optional()
      .describe("Id anotasi yang dijawab suntingan ini (dari konteks pesan / get_section_source)."),
  }),
  execute: async (input, ctx) => {
    const ownerUserId = callerId(ctx);
    return SectionProposalService.propose(getServiceDb(), {
      ownerUserId,
      sectionId: input.sectionId,
      edits: input.edits,
      fullSource: input.fullSource,
      summary: input.summary,
      respondsToAnnotationIds: input.respondsToAnnotationIds,
      threadId: threadScopeId(ctx),
    });
  },
});

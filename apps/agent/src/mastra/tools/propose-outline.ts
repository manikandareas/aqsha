import { DocumentProposalService, ProjectFactsService } from "@aqsha/services/typst";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getServiceDb } from "../lib/db";
import { callerId, threadScopeId } from "../lib/tool-context";

/**
 * propose_outline — WRITE lewat proposal. Untuk struktur bab saja; isi bab tetap lewat
 * propose_document_edit. Indeks bab mengacu ke urutan bab level-1 (0-based) seperti yang
 * dikembalikan get_document_outline pada field `chapterIndex`.
 */
export const proposeOutline = createTool({
  id: "propose_outline",
  description:
    "Usulkan perubahan struktur bab dokumen Typst proyek: tambah, ganti nama, pindahkan, atau hapus bab. `chapterIndex` = urutan bab level-1 (0-based) dari get_document_outline. Untuk mengubah ISI bab, pakai propose_document_edit. Usulan divalidasi compile dan menunggu keputusan user.",
  inputSchema: z.object({
    operations: z
      .array(
        z.discriminatedUnion("op", [
          z.object({
            op: z.literal("insert"),
            afterChapterIndex: z
              .number()
              .int()
              .min(0)
              .nullable()
              .describe("Sisipkan sesudah bab ini; null = di akhir dokumen."),
            title: z.string().min(1),
          }),
          z.object({
            op: z.literal("rename"),
            chapterIndex: z.number().int().min(0),
            title: z.string().min(1),
          }),
          z.object({
            op: z.literal("move"),
            chapterIndex: z.number().int().min(0),
            toChapterIndex: z.number().int().min(0),
          }),
          z.object({ op: z.literal("remove"), chapterIndex: z.number().int().min(0) }),
        ]),
      )
      .min(1)
      .max(32),
    summary: z
      .string()
      .min(1)
      .max(500)
      .describe("Ringkasan perubahan untuk user (bahasa Indonesia)."),
    resubmitInstruction: z
      .string()
      .min(1)
      .max(1200)
      .describe("Instruksi singkat yang diisikan ke composer bila usulan menjadi basi."),
  }),
  execute: async (input, ctx) => {
    const ownerUserId = callerId(ctx);
    const db = getServiceDb();
    const threadId = threadScopeId(ctx);
    const workspaceId = await ProjectFactsService.workspaceIdForThread(db, {
      ownerUserId,
      threadId,
    });
    if (!workspaceId) {
      return { ok: false as const, message: "Percakapan ini tidak terikat pada proyek." };
    }
    return DocumentProposalService.proposeOutline(db, {
      ownerUserId,
      workspaceId,
      threadId,
      operations: input.operations,
      summary: input.summary,
      resubmitInstruction: input.resubmitInstruction,
    });
  },
});

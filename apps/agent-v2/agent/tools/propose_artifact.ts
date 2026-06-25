import { ArtifactService } from "@aqsha/services/artifact";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { callerId, getServiceDb } from "../lib/tools.ts";

/**
 * propose_artifact (Slice 6.5 → konfirmasi percakapan) — WRITE. Buat dokumen Markdown atas
 * nama user. HITL = PERCAKAPAN: tawarkan dulu lewat teks ("mau saya simpan sebagai dokumen?")
 * dan tunggu jawaban user sebelum memanggil tool ini; eksekusi langsung membuat dokumen.
 *
 * Artifact BORN-HEADLESS (`source:'agent'`, `workspaceId:null`, `threadId` set). Save ke
 * workspace menyusul lewat kartu (`link_to_workspace`/api-v2). Debit = `normal_chat`
 * (sudah di-debit hook `step.completed`) → tool ini TANPA `consumeCredits` tambahan.
 */
export default defineTool({
  description:
    "Buat dokumen Markdown baru untuk user (mis. ringkasan, draf, catatan). Sertakan judul singkat dan isi Markdown lengkap. Tawarkan & minta persetujuan user lewat percakapan SEBELUM memanggil tool ini.",
  inputSchema: z.object({
    title: z.string().min(1).max(200).optional().describe("Judul dokumen yang ringkas."),
    markdown: z.string().min(1).describe("Isi dokumen dalam format Markdown."),
  }),
  async execute(input, ctx) {
    const ownerUserId = callerId(ctx);
    return ArtifactService.applyAgentAction(getServiceDb(), {
      ownerUserId,
      threadId: ctx.session.id,
      title: input.title,
      markdown: input.markdown,
    });
  },
});

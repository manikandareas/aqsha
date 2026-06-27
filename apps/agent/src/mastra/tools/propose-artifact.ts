import { ArtifactService } from "@aqsha/services/artifact";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getServiceDb } from "../lib/db";
import { callerId, threadScopeId } from "../lib/tool-context";

/**
 * propose_artifact — WRITE. Buat dokumen Markdown atas nama user. HITL = PERCAKAPAN: tawarkan
 * lewat teks ("mau saya simpan sebagai dokumen?") dan tunggu jawaban user sebelum memanggil
 * tool ini (TANPA requireApproval — eksekusi langsung membuat dokumen). Artifact BORN-HEADLESS
 * (`source:'agent'`, `workspaceId:null`, `threadId` set); save ke workspace menyusul via
 * `link_to_workspace`. Debit = `normal_chat` (per-turn `onFinish`).
 */
export const proposeArtifact = createTool({
  id: "propose_artifact",
  description:
    "Buat dokumen Markdown baru untuk user (mis. ringkasan, draf, catatan). Sertakan judul singkat dan isi Markdown lengkap. Tawarkan & minta persetujuan user lewat percakapan SEBELUM memanggil tool ini.",
  inputSchema: z.object({
    title: z.string().min(1).max(200).optional().describe("Judul dokumen yang ringkas."),
    markdown: z.string().min(1).describe("Isi dokumen dalam format Markdown."),
  }),
  execute: async (input, ctx) => {
    const ownerUserId = callerId(ctx);
    return ArtifactService.applyAgentAction(getServiceDb(), {
      ownerUserId,
      threadId: threadScopeId(ctx),
      title: input.title,
      markdown: input.markdown,
    });
  },
});

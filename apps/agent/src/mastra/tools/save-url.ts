import { ArtifactService } from "@aqsha/services/artifact";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getServiceDb } from "../lib/db";
import { callerEmail, callerId } from "../lib/tool-context";

/**
 * save_url — WRITE. Simpan tautan ke salah satu workspace user (idempotent dedupe + enqueue
 * url-ingestion). HITL = percakapan: konfirmasi sebelum memanggil. Debit = `normal_chat`.
 */
export const saveUrl = createTool({
  id: "save_url",
  description:
    "Simpan sebuah tautan (URL) ke workspace user agar bisa dibaca & dirujuk nanti. Panggil list_workspaces dulu untuk memilih workspace tujuan. Konfirmasi lewat percakapan sebelum memanggil tool ini.",
  inputSchema: z.object({
    workspaceId: z.string().min(1).describe("Id workspace tujuan (dari list_workspaces)."),
    url: z.string().url().describe("URL lengkap yang akan disimpan."),
    title: z.string().min(1).max(200).optional().describe("Judul opsional untuk tautan."),
  }),
  execute: async (input, ctx) => {
    const ownerUserId = callerId(ctx);
    return ArtifactService.saveUrl(getServiceDb(), {
      ownerUserId,
      ownerEmail: callerEmail(ctx),
      workspaceId: input.workspaceId,
      url: input.url,
      title: input.title,
    });
  },
});

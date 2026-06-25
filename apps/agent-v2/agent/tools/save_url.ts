import { ArtifactService } from "@aqsha/services/artifact";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { callerEmail, callerId, getServiceDb } from "../lib/tools.ts";

/**
 * save_url (Slice 6.5 → konfirmasi percakapan) — WRITE. Simpan tautan ke salah satu workspace
 * user (idempotent dedupe + enqueue url-ingestion). Butuh `workspaceId` → model panggil
 * `list_workspaces` dulu. Konfirmasi user lewat percakapan sebelum memanggil. Debit = `normal_chat`.
 */
export default defineTool({
  description:
    "Simpan sebuah tautan (URL) ke workspace user agar bisa dibaca & dirujuk nanti. Panggil list_workspaces dulu untuk memilih workspace tujuan. Konfirmasi lewat percakapan sebelum memanggil tool ini.",
  inputSchema: z.object({
    workspaceId: z.string().min(1).describe("Id workspace tujuan (dari list_workspaces)."),
    url: z.string().url().describe("URL lengkap yang akan disimpan."),
    title: z.string().min(1).max(200).optional().describe("Judul opsional untuk tautan."),
  }),
  async execute(input, ctx) {
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

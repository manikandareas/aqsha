import { ArtifactService } from "@aqsha/services/artifact";
import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { callerEmail, callerId, getServiceDb } from "../lib/tools.ts";

/**
 * save_url (Slice 6.5) — WRITE, `needsApproval: always()`. Simpan tautan ke salah satu
 * workspace user (idempotent dedupe + enqueue url-ingestion). Butuh `workspaceId` →
 * model panggil `list_workspaces` dulu. Debit = `normal_chat` (hook) → tanpa debit ekstra.
 */
export default defineTool({
  description:
    "Simpan sebuah tautan (URL) ke workspace user agar bisa dibaca & dirujuk nanti. Panggil list_workspaces dulu untuk memilih workspace tujuan. Disimpan hanya setelah user menyetujui.",
  inputSchema: z.object({
    workspaceId: z.string().min(1).describe("Id workspace tujuan (dari list_workspaces)."),
    url: z.string().url().describe("URL lengkap yang akan disimpan."),
    title: z.string().min(1).max(200).optional().describe("Judul opsional untuk tautan."),
  }),
  needsApproval: always(),
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

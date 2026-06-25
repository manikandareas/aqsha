import { ArtifactService } from "@aqsha/services/artifact";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { callerEmail, callerId, getServiceDb } from "../lib/tools.ts";

/**
 * link_to_workspace (Slice 6.5 → konfirmasi percakapan) — WRITE. Simpan artifact HEADLESS
 * (yang dibuat agen / attachment, `workspaceId=null`) ke workspace user. Method service terpisah
 * dari move (`update`) — lihat `ArtifactService.linkToWorkspace`. Konfirmasi user lewat percakapan
 * sebelum memanggil. Debit = `normal_chat` (hook).
 */
export default defineTool({
  description:
    "Simpan/arsipkan dokumen yang baru dibuat ke salah satu workspace user. Panggil list_workspaces dulu. Konfirmasi lewat percakapan sebelum memanggil tool ini.",
  inputSchema: z.object({
    artifactId: z.string().min(1).describe("Id artifact (mis. dari propose_artifact)."),
    workspaceId: z.string().min(1).describe("Id workspace tujuan (dari list_workspaces)."),
  }),
  async execute(input, ctx) {
    const ownerUserId = callerId(ctx);
    return ArtifactService.linkToWorkspace(getServiceDb(), {
      ownerUserId,
      ownerEmail: callerEmail(ctx),
      artifactId: input.artifactId,
      workspaceId: input.workspaceId,
    });
  },
});

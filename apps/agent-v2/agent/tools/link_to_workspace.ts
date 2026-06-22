import { ArtifactService } from "@aqsha/services/artifact";
import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { callerEmail, callerId, getServiceDb } from "../lib/tools.ts";

/**
 * link_to_workspace (Slice 6.5) — WRITE, `needsApproval: always()`. Simpan artifact
 * HEADLESS (yang dibuat agen / attachment, `workspaceId=null`) ke workspace user. Method
 * service terpisah dari move (`update`) — lihat `ArtifactService.linkToWorkspace`. Debit =
 * `normal_chat` (hook) → tanpa debit ekstra.
 */
export default defineTool({
  description:
    "Simpan/arsipkan dokumen yang baru dibuat ke salah satu workspace user. Panggil list_workspaces dulu. Diterapkan hanya setelah user menyetujui.",
  inputSchema: z.object({
    artifactId: z.string().min(1).describe("Id artifact (mis. dari propose_artifact)."),
    workspaceId: z.string().min(1).describe("Id workspace tujuan (dari list_workspaces)."),
  }),
  needsApproval: always(),
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

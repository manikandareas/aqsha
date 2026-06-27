import { ArtifactService } from "@aqsha/services/artifact";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getServiceDb } from "../lib/db";
import { callerEmail, callerId } from "../lib/tool-context";

/**
 * link_to_workspace — WRITE. Simpan artifact HEADLESS (dibuat agen / attachment,
 * `workspaceId=null`) ke workspace user. HITL = percakapan: konfirmasi sebelum memanggil.
 * Debit = `normal_chat` (per-turn `onFinish`).
 */
export const linkToWorkspace = createTool({
  id: "link_to_workspace",
  description:
    "Simpan/arsipkan dokumen yang baru dibuat ke salah satu workspace user. Panggil list_workspaces dulu. Konfirmasi lewat percakapan sebelum memanggil tool ini.",
  inputSchema: z.object({
    artifactId: z.string().min(1).describe("Id artifact (mis. dari propose_artifact)."),
    workspaceId: z.string().min(1).describe("Id workspace tujuan (dari list_workspaces)."),
  }),
  execute: async (input, ctx) => {
    const ownerUserId = callerId(ctx);
    return ArtifactService.linkToWorkspace(getServiceDb(), {
      ownerUserId,
      ownerEmail: callerEmail(ctx),
      artifactId: input.artifactId,
      workspaceId: input.workspaceId,
    });
  },
});

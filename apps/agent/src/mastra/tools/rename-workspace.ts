import { WorkspaceService } from "@aqsha/services/workspace";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getServiceDb } from "../lib/db";
import { callerId } from "../lib/tool-context";

/**
 * rename_workspace — WRITE (assert owner di service). HITL = percakapan: konfirmasi user
 * sebelum memanggil. Debit = `normal_chat` (per-turn `onFinish`).
 */
export const renameWorkspace = createTool({
  id: "rename_workspace",
  description:
    "Ubah nama sebuah workspace milik user. Panggil list_workspaces dulu untuk id-nya. Konfirmasi lewat percakapan sebelum memanggil tool ini.",
  inputSchema: z.object({
    workspaceId: z.string().min(1).describe("Id workspace (dari list_workspaces)."),
    name: z.string().min(1).max(120).describe("Nama baru."),
  }),
  execute: async (input, ctx) => {
    const ownerUserId = callerId(ctx);
    return WorkspaceService.update(getServiceDb(), {
      ownerUserId,
      workspaceId: input.workspaceId,
      name: input.name,
    });
  },
});

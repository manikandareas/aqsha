import { WorkspaceService } from "@aqsha/services/workspace";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { callerId, getServiceDb } from "../lib/tools.ts";

/**
 * rename_workspace (Slice 6.5 → konfirmasi percakapan) — WRITE (assert owner di service).
 * Konfirmasi user lewat percakapan sebelum memanggil. Debit = `normal_chat` (hook).
 */
export default defineTool({
  description:
    "Ubah nama sebuah workspace milik user. Panggil list_workspaces dulu untuk id-nya. Konfirmasi lewat percakapan sebelum memanggil tool ini.",
  inputSchema: z.object({
    workspaceId: z.string().min(1).describe("Id workspace (dari list_workspaces)."),
    name: z.string().min(1).max(120).describe("Nama baru."),
  }),
  async execute(input, ctx) {
    const ownerUserId = callerId(ctx);
    return WorkspaceService.update(getServiceDb(), {
      ownerUserId,
      workspaceId: input.workspaceId,
      name: input.name,
    });
  },
});

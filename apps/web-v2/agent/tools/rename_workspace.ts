import { WorkspaceService } from "@aqsha/services/workspace";
import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { callerId, getServiceDb } from "../lib/tools.ts";

/**
 * rename_workspace (Slice 6.5) — WRITE, `needsApproval: always()`. Ubah nama workspace
 * milik user (assert owner di service). Debit = `normal_chat` (hook) → tanpa debit ekstra.
 */
export default defineTool({
  description:
    "Ubah nama sebuah workspace milik user. Panggil list_workspaces dulu untuk id-nya. Diterapkan hanya setelah user menyetujui.",
  inputSchema: z.object({
    workspaceId: z.string().min(1).describe("Id workspace (dari list_workspaces)."),
    name: z.string().min(1).max(120).describe("Nama baru."),
  }),
  needsApproval: always(),
  async execute(input, ctx) {
    const ownerUserId = callerId(ctx);
    return WorkspaceService.update(getServiceDb(), {
      ownerUserId,
      workspaceId: input.workspaceId,
      name: input.name,
    });
  },
});

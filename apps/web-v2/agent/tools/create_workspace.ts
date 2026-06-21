import { WorkspaceService } from "@aqsha/services/workspace";
import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { callerEmail, callerId, getServiceDb } from "../lib/tools";

/**
 * create_workspace (Slice 6.5) — WRITE, `needsApproval: always()`. Buat workspace baru
 * (gate kapasitas per-plan di service). Debit = `normal_chat` (hook) → tanpa debit ekstra.
 */
export default defineTool({
  description:
    "Buat workspace (ruang kerja) baru untuk user. Dibuat hanya setelah user menyetujui.",
  inputSchema: z.object({
    name: z.string().min(1).max(120).describe("Nama workspace."),
  }),
  needsApproval: always(),
  async execute(input, ctx) {
    const ownerUserId = callerId(ctx);
    return WorkspaceService.create(getServiceDb(), {
      ownerUserId,
      ownerEmail: callerEmail(ctx),
      name: input.name,
    });
  },
});

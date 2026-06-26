import { WorkspaceService } from "@aqsha/services/workspace";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { callerEmail, callerId, getServiceDb } from "../lib/tools.ts";

/**
 * create_workspace (Slice 6.5 → konfirmasi percakapan) — WRITE (gate kapasitas per-plan di
 * service). Konfirmasi user lewat percakapan sebelum memanggil. Debit = `normal_chat` (hook).
 */
export default defineTool({
  description:
    "Buat workspace (ruang kerja) baru untuk user. Konfirmasi lewat percakapan sebelum memanggil tool ini.",
  inputSchema: z.object({
    name: z.string().min(1).max(120).describe("Nama workspace."),
  }),
  async execute(input, ctx) {
    const ownerUserId = callerId(ctx);
    return WorkspaceService.create(getServiceDb(), {
      ownerUserId,
      ownerEmail: callerEmail(ctx),
      name: input.name,
    });
  },
});

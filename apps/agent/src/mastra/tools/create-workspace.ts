import { WorkspaceService } from "@aqsha/services/workspace";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getServiceDb } from "../lib/db";
import { callerEmail, callerId } from "../lib/tool-context";

/**
 * create_workspace — WRITE (gate kapasitas per-plan di service). HITL = percakapan: konfirmasi
 * user sebelum memanggil. Debit = `normal_chat` (per-turn `onFinish`).
 */
export const createWorkspace = createTool({
  id: "create_workspace",
  description:
    "Buat workspace (ruang kerja) baru untuk user. Konfirmasi lewat percakapan sebelum memanggil tool ini.",
  inputSchema: z.object({
    name: z.string().min(1).max(120).describe("Nama workspace."),
  }),
  execute: async (input, ctx) => {
    const ownerUserId = callerId(ctx);
    // Tool percakapan membuat proyek bebas; jenis karya tulis dipilih user lewat UI.
    return WorkspaceService.create(getServiceDb(), {
      ownerUserId,
      ownerEmail: callerEmail(ctx),
      name: input.name,
      kind: "freeform",
    });
  },
});

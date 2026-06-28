import { WorkspaceService } from "@aqsha/services/workspace";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getServiceDb } from "../lib/db";
import { callerId } from "../lib/tool-context";

/**
 * list_workspaces — port 1:1 dari eve `defineTool` ke Mastra `createTool` (Fase 0:
 * bukti bahwa Node build Mastra bisa mengonsumsi paket workspace `@aqsha/services`
 * in-process; owner = resourceId terautentikasi, bukan argumen model). READ, tanpa
 * approval, tanpa debit.
 */
export const listWorkspaces = createTool({
  id: "list_workspaces",
  description:
    "Daftar workspace (ruang kerja) milik pengguna: nama + id. Pakai untuk merujuk atau menyarankan tempat menyimpan dokumen.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(30).optional().describe("Jumlah maksimum (default 30)."),
  }),
  outputSchema: z.object({
    workspaces: z.array(
      z.object({
        workspaceId: z.string(),
        name: z.string(),
        status: z.string(),
      }),
    ),
  }),
  execute: async (input, ctx) => {
    const ownerUserId = callerId(ctx);
    const { items } = await WorkspaceService.list(getServiceDb(), ownerUserId, {
      limit: input.limit ?? 30,
    });
    return {
      workspaces: items.map((w) => ({ workspaceId: w.id, name: w.name, status: w.status })),
    };
  },
});

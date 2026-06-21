import { WorkspaceService } from "@aqsha/services/workspace";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { callerId, getServiceDb } from "../lib/tools";

/**
 * list_workspaces (Slice 6.4) — daftar workspace milik pengguna. READ, tanpa
 * approval, tanpa debit. Membantu Astra merujuk/menyarankan tempat menyimpan.
 */
export default defineTool({
  description:
    "Daftar workspace (ruang kerja) milik pengguna: nama + id. Pakai untuk merujuk atau menyarankan tempat menyimpan dokumen.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(30).optional().describe("Jumlah maksimum (default 30)."),
  }),
  async execute(input, ctx) {
    const ownerUserId = callerId(ctx);
    const { items } = await WorkspaceService.list(getServiceDb(), ownerUserId, {
      limit: input.limit ?? 30,
    });
    return {
      workspaces: items.map((w) => ({ workspaceId: w.id, name: w.name, status: w.status })),
    };
  },
});

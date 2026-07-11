import { CitationService } from "@aqsha/services/citations";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getServiceDb } from "../lib/db";
import { callerId } from "../lib/tool-context";

/** Nama tampilan penulis (corporate `literal`, else "Given Family"). */
function authorNames(authors: Array<{ family?: string; given?: string; literal?: string }>): string[] {
  return authors
    .map((a) => (a.literal ? a.literal : [a.given, a.family].filter(Boolean).join(" ")).trim())
    .filter(Boolean);
}

/**
 * search_workspace_citations — cari referensi di Citation Library sebuah workspace.
 * READ-only, tanpa approval, tanpa debit. workspaceId di-scope sebagai input (dari catatan
 * konteks referensi tersemat) karena tool tak punya workspaceId ambient.
 */
export const searchWorkspaceCitations = createTool({
  id: "search_workspace_citations",
  description:
    "Cari referensi/sitasi di Citation Library sebuah workspace (judul, penulis, venue, DOI). READ-only. Butuh workspaceId (dari catatan konteks 'Referensi tersemat', atau minta pengguna menyebut workspace-nya). Untuk membaca metadata lengkap satu referensi, lanjut ke get_workspace_citation.",
  inputSchema: z.object({
    workspaceId: z
      .string()
      .min(1)
      .describe("Workspace yang Citation Library-nya dicari (workspaceId dari catatan konteks)."),
    query: z
      .string()
      .max(500)
      .optional()
      .describe("Kata kunci judul/penulis/venue/DOI. Kosongkan untuk daftar referensi terbaru."),
    tag: z.string().max(80).optional().describe("Filter ke satu tag."),
    limit: z.number().int().min(1).max(50).optional().describe("Jumlah maksimum (default 20)."),
  }),
  execute: async (input, ctx) => {
    const ownerUserId = callerId(ctx);
    const result = await CitationService.list(getServiceDb(), {
      ownerUserId,
      workspaceId: input.workspaceId,
      cursor: null,
      limit: input.limit ?? 20,
      q: input.query,
      tag: input.tag,
    });
    return {
      total: result.total,
      citations: result.items.map((c) => ({
        citationId: c.id,
        title: c.title,
        authors: authorNames(c.authors),
        year: c.publishedYear,
        venue: c.venue,
        doi: c.doi,
        tags: c.tags,
        metadataStatus: c.metadataStatus,
      })),
    };
  },
});

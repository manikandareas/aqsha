import { CitationService } from "@aqsha/services/citations";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getServiceDb } from "../lib/db";
import { callerId } from "../lib/tool-context";

function authorNames(authors: Array<{ family?: string; given?: string; literal?: string }>): string[] {
  return authors
    .map((a) => (a.literal ? a.literal : [a.given, a.family].filter(Boolean).join(" ")).trim())
    .filter(Boolean);
}

/**
 * get_workspace_citation — baca metadata lengkap satu referensi Citation Library.
 * READ-only, tanpa approval, tanpa debit. Menyisipkan sitasi ke dokumen tetap aksi pengguna
 * (tool ini tidak menulis); sarankan pengguna memakai perintah /sitasi di editor.
 */
export const getWorkspaceCitation = createTool({
  id: "get_workspace_citation",
  description:
    "Baca metadata lengkap satu referensi dari perpustakaan sitasi user (judul, penulis, tahun, venue, penerbit, DOI, URL, tags, status, jumlah dokumen pemakai). READ-only. Butuh citationId (dari catatan konteks 'Referensi tersemat' atau hasil search_workspace_citations). JANGAN mengarang field yang tak tercantum.",
  inputSchema: z.object({
    citationId: z.string().min(1).describe("Referensi yang dibaca (citationId)."),
  }),
  execute: async (input, ctx) => {
    const ownerUserId = callerId(ctx);
    const c = await CitationService.get(getServiceDb(), {
      ownerUserId,
      citationId: input.citationId,
    });
    return {
      citationId: c.id,
      title: c.title,
      authors: authorNames(c.authors),
      year: c.publishedYear,
      venue: c.venue,
      publisher: c.publisher,
      doi: c.doi,
      url: c.url,
      tags: c.tags,
      documentType: c.documentType,
      metadataStatus: c.metadataStatus,
      usedInDocuments: c.usageCount ?? 0,
    };
  },
});

import { ArtifactService } from "@aqsha/services/artifact";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getServiceDb } from "../lib/db";
import { callerId } from "../lib/tool-context";

/**
 * get_render_payload — isi penuh satu artifact (markdown/teks/URL readable; pdf/docx →
 * `extractedText` hasil indexing + presigned URL). Headless-tolerant. READ, tanpa approval,
 * tanpa debit. Paging `offset`/`maxChars` (IMP-8): dokumen >80k char dibaca per-halaman —
 * tanpa ini ekornya tak pernah terjangkau.
 */
export const getRenderPayload = createTool({
  id: "get_render_payload",
  description:
    "Baca ISI PENUH sebuah artifact: teks markdown/plain, teks readable URL, atau untuk PDF/DOCX teks hasil ekstraksi di field `extractedText` (plus URL unduhan). Pakai `extractedText` untuk membaca/meringkas/mengutip isi dokumen — jangan menyimpulkan dari URL atau nama berkas saja. Dokumen panjang terpotong di ~80k karakter: `extractedTextTotalChars` memberi tahu panjang totalnya, dan bagian lanjutan dibaca dengan memanggil ulang memakai `offset` (nilainya disebut di penanda pemotongan).",
  inputSchema: z.object({
    artifactId: z.string().min(1).describe("Id artifact dari list_artifacts."),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Indeks karakter awal `extractedText` (paging PDF/DOCX panjang, default 0)."),
    maxChars: z
      .number()
      .int()
      .min(1)
      .max(80_000)
      .optional()
      .describe("Batas panjang potongan `extractedText` (default & maksimum 80000)."),
  }),
  execute: async (input, ctx) => {
    const ownerUserId = callerId(ctx);
    const payload = await ArtifactService.getRenderPayload(
      getServiceDb(),
      ownerUserId,
      input.artifactId,
      {
        includeExtractedText: true,
        ...(input.offset !== undefined ? { textOffset: input.offset } : {}),
        ...(input.maxChars !== undefined ? { textMaxChars: input.maxChars } : {}),
      },
    );
    if (!payload) return { found: false as const };
    return { found: true as const, payload };
  },
});

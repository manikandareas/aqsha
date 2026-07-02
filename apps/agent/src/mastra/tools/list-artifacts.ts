import { ArtifactService } from "@aqsha/services/artifact";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getServiceDb } from "../lib/db";
import { callerId, threadScopeId } from "../lib/tool-context";

/**
 * list_artifacts — daftar dokumen yang terlampir pada percakapan ini (headless-tolerant).
 * READ, tanpa approval, tanpa debit.
 */
export const listArtifacts = createTool({
  id: "list_artifacts",
  description:
    "Daftar dokumen/artifact yang terlampir pada percakapan ini (judul, jenis, status indexing). Pakai untuk tahu dokumen apa yang tersedia sebelum membacanya.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(50).optional().describe("Jumlah maksimum (default 50)."),
  }),
  execute: async (input, ctx) => {
    const ownerUserId = callerId(ctx);
    const items = await ArtifactService.listByThread(
      getServiceDb(),
      ownerUserId,
      threadScopeId(ctx),
      input.limit,
    );
    return {
      artifacts: items.map((a) => ({
        artifactId: a._id,
        title: a.title,
        artifactType: a.artifactType,
        indexingStatus: a.indexingStatus,
        plainTextPreview: a.plainTextPreview,
      })),
    };
  },
});

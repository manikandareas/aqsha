import { ArtifactService } from "@aqsha/services/artifact";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { callerId, getServiceDb } from "../lib/tools.ts";

/**
 * list_artifacts (Slice 6.4) — daftar dokumen yang terlampir pada percakapan ini
 * (headless-tolerant). READ, tanpa approval, tanpa debit.
 */
export default defineTool({
  description:
    "Daftar dokumen/artifact yang terlampir pada percakapan ini (judul, jenis, status indexing). Pakai untuk tahu dokumen apa yang tersedia sebelum membacanya.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(50).optional().describe("Jumlah maksimum (default 50)."),
  }),
  async execute(input, ctx) {
    const ownerUserId = callerId(ctx);
    const items = await ArtifactService.listByThread(
      getServiceDb(),
      ownerUserId,
      ctx.session.id,
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

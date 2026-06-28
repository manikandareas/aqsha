import { ArtifactService } from "@aqsha/services/artifact";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getServiceDb } from "../lib/db";
import { callerId } from "../lib/tool-context";

/**
 * get_render_payload — isi penuh satu artifact (markdown/teks/URL readable; pdf/docx →
 * presigned URL). Headless-tolerant. READ, tanpa approval, tanpa debit.
 */
export const getRenderPayload = createTool({
  id: "get_render_payload",
  description:
    "Baca isi penuh sebuah artifact: teks markdown/plain, teks readable URL, atau URL unduhan untuk PDF/DOCX. Gunakan untuk mengutip isi dokumen terlampir.",
  inputSchema: z.object({
    artifactId: z.string().min(1).describe("Id artifact dari list_artifacts."),
  }),
  execute: async (input, ctx) => {
    const ownerUserId = callerId(ctx);
    const payload = await ArtifactService.getRenderPayload(
      getServiceDb(),
      ownerUserId,
      input.artifactId,
    );
    if (!payload) return { found: false as const };
    return { found: true as const, payload };
  },
});

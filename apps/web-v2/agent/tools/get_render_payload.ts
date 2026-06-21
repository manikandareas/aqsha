import { ArtifactService } from "@aqsha/services/artifact";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { callerId, getServiceDb } from "../lib/tools";

/**
 * get_render_payload (Slice 6.4) — isi penuh satu artifact (markdown/teks/URL
 * readable; pdf/docx → presigned URL). Headless-tolerant. READ, tanpa approval,
 * tanpa debit. Inilah cara membaca isi dokumen terlampir untuk menjawab.
 */
export default defineTool({
  description:
    "Baca isi penuh sebuah artifact: teks markdown/plain, teks readable URL, atau URL unduhan untuk PDF/DOCX. Gunakan untuk mengutip isi dokumen terlampir.",
  inputSchema: z.object({
    artifactId: z.string().min(1).describe("Id artifact dari list_artifacts."),
  }),
  async execute(input, ctx) {
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

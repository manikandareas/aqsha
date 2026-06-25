import { ArtifactService } from "@aqsha/services/artifact";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { callerId, getServiceDb } from "../lib/tools.ts";

/**
 * get_artifact (Slice 6.4) — metadata satu artifact (headless-tolerant). READ,
 * tanpa approval, tanpa debit. Untuk isi penuh, pakai `get_render_payload`.
 */
export default defineTool({
  description:
    "Ambil metadata satu artifact/dokumen (judul, jenis, status). Untuk isi/teks penuhnya gunakan get_render_payload.",
  inputSchema: z.object({
    artifactId: z.string().min(1).describe("Id artifact dari list_artifacts."),
  }),
  async execute(input, ctx) {
    const ownerUserId = callerId(ctx);
    const item = await ArtifactService.getForAgent(getServiceDb(), ownerUserId, input.artifactId);
    if (!item) return { found: false as const };
    return {
      found: true as const,
      artifact: {
        artifactId: item._id,
        title: item.title,
        artifactType: item.artifactType,
        indexingStatus: item.indexingStatus,
        fileName: item.fileName,
        mimeType: item.mimeType,
        plainTextPreview: item.plainTextPreview,
      },
    };
  },
});

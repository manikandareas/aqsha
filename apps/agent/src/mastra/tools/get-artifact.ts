import { ArtifactService } from "@aqsha/services/artifact";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getServiceDb } from "../lib/db";
import { callerId } from "../lib/tool-context";

/**
 * get_artifact — metadata satu artifact/dokumen (headless-tolerant). READ, tanpa approval,
 * tanpa debit. Untuk isi penuh, pakai `get_render_payload`.
 */
export const getArtifact = createTool({
  id: "get_artifact",
  description:
    "Ambil metadata satu artifact/dokumen (judul, jenis, status). Untuk isi/teks penuhnya gunakan get_render_payload.",
  inputSchema: z.object({
    artifactId: z.string().min(1).describe("Id artifact dari list_artifacts."),
  }),
  execute: async (input, ctx) => {
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

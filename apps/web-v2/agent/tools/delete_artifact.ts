import { ArtifactService } from "@aqsha/services/artifact";
import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { callerId, getServiceDb } from "../lib/tools.ts";

/**
 * delete_artifact (Slice 6.5) — WRITE destruktif, `needsApproval: always()`. Soft-delete
 * + enqueue cleanup (lihat `ArtifactService.remove`). HANYA artifact workspace-scoped
 * (assert di service); artifact headless tak bisa dihapus lewat sini (belum ter-file).
 */
export default defineTool({
  description:
    "Hapus sebuah dokumen/artifact milik user dari workspace-nya. Dihapus hanya setelah user mengonfirmasi.",
  inputSchema: z.object({
    artifactId: z.string().min(1).describe("Id artifact yang akan dihapus."),
  }),
  needsApproval: always(),
  async execute(input, ctx) {
    const ownerUserId = callerId(ctx);
    return ArtifactService.remove(getServiceDb(), { ownerUserId, artifactId: input.artifactId });
  },
});

import { ArtifactService } from "@aqsha/services/artifact";
import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { callerId, getServiceDb } from "../lib/tools.ts";

/**
 * delete_artifact (Slice 6.5) — WRITE DESTRUKTIF. Soft-delete + enqueue cleanup (lihat
 * `ArtifactService.remove`). HANYA artifact workspace-scoped (assert di service).
 * Gerbang HITL: `needsApproval: always()` → UI kartu konfirmasi di atas composer sebelum
 * eksekusi (eve `input.requested` / `session.waiting`).
 */
export default defineTool({
  description:
    "Hapus sebuah dokumen/artifact milik user dari workspace-nya. Memerlukan persetujuan user di UI sebelum dijalankan — penghapusan langsung berlaku setelah disetujui.",
  inputSchema: z.object({
    artifactId: z.string().min(1).describe("Id artifact yang akan dihapus."),
  }),
  needsApproval: always(),
  async execute(input, ctx) {
    const ownerUserId = callerId(ctx);
    return ArtifactService.remove(getServiceDb(), { ownerUserId, artifactId: input.artifactId });
  },
});

import { ArtifactService } from "@aqsha/services/artifact";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getServiceDb } from "../lib/db";
import { callerId } from "../lib/tool-context";

/**
 * delete_artifact — WRITE DESTRUKTIF. Soft-delete + enqueue cleanup. HANYA artifact
 * workspace-scoped (assert di service). HITL = Mastra Agent Approval (`requireApproval: true`):
 * server memancarkan chunk `tool-call-approval` → FE menampilkan kartu konfirmasi → user
 * `approveToolCall()/declineToolCall()` sebelum eksekusi. Satu-satunya tool write ber-kartu
 * (parity eve `needsApproval`; write lain = konfirmasi percakapan).
 */
export const deleteArtifact = createTool({
  id: "delete_artifact",
  description:
    "Hapus sebuah dokumen/artifact milik user dari workspace-nya. Memerlukan persetujuan user di UI sebelum dijalankan — penghapusan langsung berlaku setelah disetujui.",
  inputSchema: z.object({
    artifactId: z.string().min(1).describe("Id artifact yang akan dihapus."),
  }),
  requireApproval: true,
  execute: async (input, ctx) => {
    const ownerUserId = callerId(ctx);
    return ArtifactService.remove(getServiceDb(), { ownerUserId, artifactId: input.artifactId });
  },
});

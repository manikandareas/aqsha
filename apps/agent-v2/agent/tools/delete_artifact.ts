import { ArtifactService } from "@aqsha/services/artifact";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { callerId, getServiceDb } from "../lib/tools.ts";

/**
 * delete_artifact (Slice 6.5 → konfirmasi percakapan) — WRITE DESTRUKTIF. Soft-delete +
 * enqueue cleanup (lihat `ArtifactService.remove`). HANYA artifact workspace-scoped (assert di
 * service). WAJIB: tanya konfirmasi user lewat TEKS + tunggu jawaban sebelum memanggil tool ini —
 * eksekusi langsung menghapus (tak ada gerbang approval lain).
 */
export default defineTool({
  description:
    "Hapus sebuah dokumen/artifact milik user dari workspace-nya. WAJIB tanya konfirmasi user lewat percakapan dan tunggu jawabannya SEBELUM memanggil tool ini — penghapusan langsung berlaku.",
  inputSchema: z.object({
    artifactId: z.string().min(1).describe("Id artifact yang akan dihapus."),
  }),
  async execute(input, ctx) {
    const ownerUserId = callerId(ctx);
    return ArtifactService.remove(getServiceDb(), { ownerUserId, artifactId: input.artifactId });
  },
});

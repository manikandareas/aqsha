import { ArtifactService } from "@aqsha/services/artifact";
import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { callerId, getServiceDb } from "../lib/tools.ts";

/**
 * propose_artifact (Slice 6.5) — WRITE. Buat dokumen Markdown atas nama user.
 *
 * HITL native eve: `needsApproval: always()` → eve PARK turn di `approval-requested`
 * SEBELUM `execute()`; client menampilkan input (judul + isi) untuk di-review; baru saat
 * user approve, `execute()` jalan dan materialize. Satu tool = propose+approve+write
 * (eve `needsApproval` sudah menjamin tak ada tulis tanpa approval — tak perlu tool
 * `execute_artifact` terpisah seperti V1 yang bergantung tool-gating per-turn).
 *
 * Artifact BORN-HEADLESS (`source:'agent'`, `workspaceId:null`, `threadId` set). Save ke
 * workspace menyusul lewat kartu (`link_to_workspace`/api-v2). Debit = `normal_chat`
 * (sudah di-debit hook `step.completed`) → tool ini TANPA `consumeCredits` tambahan.
 */
export default defineTool({
  description:
    "Buat dokumen Markdown baru untuk user (mis. ringkasan, draf, catatan). Sertakan judul singkat dan isi Markdown lengkap. Dokumen dibuat hanya setelah user menyetujui.",
  inputSchema: z.object({
    title: z.string().min(1).max(200).optional().describe("Judul dokumen yang ringkas."),
    markdown: z.string().min(1).describe("Isi dokumen dalam format Markdown."),
  }),
  needsApproval: always(),
  async execute(input, ctx) {
    const ownerUserId = callerId(ctx);
    return ArtifactService.applyAgentAction(getServiceDb(), {
      ownerUserId,
      threadId: ctx.session.id,
      title: input.title,
      markdown: input.markdown,
    });
  },
});

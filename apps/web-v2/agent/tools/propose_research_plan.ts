import { BillingService } from "@aqsha/services/billing";
import { estimateCredits } from "@aqsha/services/plan";
import { defineTool } from "eve/tools";
import { once } from "eve/tools/approval";
import { z } from "zod";
import { callerEmail, callerId, getServiceDb } from "../lib/tools.ts";

/**
 * propose_research_plan (Slice 7.0) — gerbang HITL + commit billing untuk satu run
 * /deep. Pola dari `propose_artifact.ts` (`needsApproval`), tapi `once()`: rencana
 * riset diusulkan SEKALI per session; eve PARK turn di `approval-requested` sebelum
 * `execute()`. Saat user approve, `execute()` jadi titik commit alami satu deep-run:
 *
 * - GATE `requireEntitlement(feature:'deep_research', requiredPlan:'free')` —
 *   `requiredPlan:'free'` WAJIB untuk Lite-deep agar Free pakai kuota bulanan
 *   `deepResearchRuns` (plan.ts:161), bukan ditolak `subscription_required`.
 * - DEBIT `consumeCredits(feature:'deep_research', idempotencyKey: thread+turn)` —
 *   increment 1 slot deep bulanan, idempoten saat resume durable (A9).
 *
 * Blok = return-union `{ ok:false, reason }` (model relay "kuota deep habis") — JANGAN
 * throw (return-union P5/P6). Sukses = `{ proposed:true, ... }`, tanpa side-effect lain
 * (riset sebenarnya dilakukan model setelah ini, dipandu skill deep-research).
 */
export default defineTool({
  description:
    "Usulkan rencana riset mendalam untuk disetujui user SEBELUM memulai. Sertakan judul, ringkasan opsional, dan 3-6 sub-pertanyaan yang fokus dan bisa ditelusuri terpisah. Rencana baru dieksekusi setelah user menyetujui.",
  inputSchema: z.object({
    title: z.string().min(1).max(120).describe("Judul ringkas rencana riset."),
    summary: z.string().max(500).optional().describe("Ringkasan satu kalimat tujuan riset."),
    questions: z
      .array(z.string().min(1))
      .min(3)
      .max(6)
      .describe("3-6 sub-pertanyaan riset yang fokus dan independen."),
  }),
  needsApproval: once(),
  async execute(input, ctx) {
    const ownerUserId = callerId(ctx);
    const ownerEmail = callerEmail(ctx);
    const db = getServiceDb();
    const credits = estimateCredits({ feature: "deep_research", agentKind: "lite" });

    const gate = await BillingService.requireEntitlement(db, {
      ownerUserId,
      ownerEmail,
      feature: "deep_research",
      credits,
      requiredPlan: "free",
    });
    if (!gate.ok) return { ok: false as const, reason: gate.reason };

    const debit = await BillingService.consumeCredits(db, {
      ownerUserId,
      ownerEmail,
      feature: "deep_research",
      provider: "openai",
      agentKind: "lite",
      requiredPlan: "free",
      threadId: ctx.session.id,
      idempotencyKey: `${ctx.session.id}:${ctx.session.turn.id}:deep`,
    });
    if (!debit.ok) return { ok: false as const, reason: debit.reason };

    return { proposed: true as const, title: input.title, questions: input.questions };
  },
});

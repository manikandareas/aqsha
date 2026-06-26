import { BillingService } from "@aqsha/services/billing";
import { estimateCredits } from "@aqsha/services/plan";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { callerEmail, callerId, getServiceDb } from "../lib/tools.ts";

/**
 * begin_deep_research — gerbang billing satu run `/deep` saat EKSEKUSI (bukan approval).
 * Menggantikan `propose_research_plan` (plan kini prosa + konfirmasi via `ask_question`).
 *
 * Skill deep-research memanggil tool ini SEKALI, setelah user mengonfirmasi rencana lewat
 * `ask_question` dan TEPAT sebelum mulai mendelegasikan ke subagent. Ini titik commit alami satu
 * deep-run:
 * - GATE `requireEntitlement(feature:'deep_research', requiredPlan:'free')` — Free pakai kuota
 *   bulanan `deepResearchRuns` (plan.ts), bukan ditolak `subscription_required`. Blok = stop.
 * - DEBIT `consumeCredits(feature:'deep_research', idempotencyKey: session:turn:deep)` —
 *   increment 1 slot deep bulanan, idempoten saat resume durable / re-run turn (A9).
 *
 * Blok = return-union `{ ok:false, reason }` (model relay "kuota deep habis" lalu HENTIKAN —
 * JANGAN riset). Sukses = `{ ok:true }` → model lanjut delegasi subagent. TANPA `needsApproval`
 * (konfirmasi rencana terjadi via `ask_question`, bukan approval tool).
 */
export default defineTool({
  description:
    "Mulai eksekusi riset mendalam (deep research) untuk run ini. Panggil SEKALI setelah user mengonfirmasi rencana riset lewat `ask_question`, TEPAT sebelum mendelegasikan ke subagent. Mengunci kuota deep research; bila `{ ok:false }`, sampaikan alasannya ke user dan hentikan (jangan riset).",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
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

    return { ok: true as const };
  },
});

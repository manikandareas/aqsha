import { BillingService } from "@aqsha/services/billing";
import { SendQuotaService } from "@aqsha/services/quota";
import type { ProcessInputArgs, ProcessOutputResultArgs } from "@mastra/core/processors";
import { MASTRA_THREAD_ID_KEY } from "@mastra/core/request-context";
import { getServiceDb } from "../lib/db";
import { effectiveBilledTier } from "../model";
import { type AgentKind, ownerFromRequestContext } from "../lib/tool-context";

/**
 * Billing/kuota Astra (Fase 1) — menggantikan channel `onMessage` backstop + hook `step.completed`
 * eve. Per-tier: Lite → fitur `normal_chat`; Pro → `pro_chat` (rate kredit lebih tinggi). Tiap agent
 * (`astra-lite`/`astra-pro`) memasang sepasang processor sendiri lewat `makeBillingProcessors(tier)`,
 * jadi tier inheren dari agent — tak perlu dibaca dari RequestContext di jalur chat.
 *
 * Tier billing EFEKTIF turun ke `lite` saat model Pro belum disetel (`PRO_MODEL_CONFIGURED` false):
 * Pro tanpa `AQSHA_PRO_MODEL` menghasilkan output setara Lite, jadi rate Pro (~6×) + gate plan berbayar
 * tak adil → bebankan `normal_chat`/`lite` sampai owner menyetel model.
 *
 * Owner (`MASTRA_RESOURCE_ID_KEY`) + email (`AQSHA_EMAIL_KEY`) dibaca dari RequestContext (diset auth
 * + `userContextMiddleware`) via `ownerFromRequestContext`. threadId dari `MASTRA_THREAD_ID_KEY` bila ada.
 */
export function makeBillingProcessors(tier: AgentKind) {
  const billedTier = effectiveBilledTier(tier);
  const feature = billedTier === "pro" ? ("pro_chat" as const) : ("normal_chat" as const);

  /**
   * Pre-check kuota/cooldown OTORITATIF (inputProcessor) — backstop server-side untuk gate ramah di
   * composer (`GET /threads/send-status`). Blok → `abort()` (tripwire) sehingga turn TIDAK jalan; FE
   * memetakan tripwire ke pesan kuota. Pro juga di-gate plan berbayar via `feature: "pro_chat"`.
   */
  const precheck = {
    id: `billing-precheck-${tier}`,
    async processInput({ requestContext, abort, messageList }: ProcessInputArgs) {
      const { id: ownerUserId, email: ownerEmail } = ownerFromRequestContext(requestContext);
      if (!ownerUserId) return messageList;
      const quota = await SendQuotaService.check(getServiceDb(), {
        ownerUserId,
        ownerEmail,
        feature,
      });
      if (!quota.ok) {
        abort("Kuota chat habis atau cooldown aktif. Coba lagi nanti.", {
          metadata: { reason: quota.reason, retryAt: quota.retryAt },
        });
      }
      return messageList;
    },
  };

  /**
   * Debit kredit PER-TURN (outputProcessor) — `result.usage` kumulatif lintas-step → satu
   * `consumeCredits` per turn (lebih sederhana dari per-step eve; plan §6). Resume Mastra me-REPLAY
   * stream ter-buffer (tak re-generate) → tak ada double-debit, jadi idempotencyKey tak wajib.
   * `feature`/`agentKind` per-tier → rate kredit (`pro_chat` ~6× `normal_chat`) ditentukan tier.
   * Swallow: kegagalan billing tak boleh meracuni turn.
   */
  const debit = {
    id: `billing-debit-${tier}`,
    async processOutputResult({ requestContext, result, messageList }: ProcessOutputResultArgs) {
      const { id: ownerUserId, email: ownerEmail } = ownerFromRequestContext(requestContext);
      if (ownerUserId) {
        const threadIdRaw = requestContext?.get(MASTRA_THREAD_ID_KEY);
        const threadId = typeof threadIdRaw === "string" && threadIdRaw ? threadIdRaw : undefined;
        const usage = result.usage;
        try {
          await BillingService.consumeCredits(getServiceDb(), {
            ownerUserId,
            ownerEmail,
            feature,
            provider: "openai",
            agentKind: billedTier,
            threadId,
            inputTokens: usage.inputTokens ?? 0,
            outputTokens: usage.outputTokens ?? 0,
            totalTokens: usage.totalTokens ?? 0,
          });
        } catch (err) {
          console.error("[billing] consumeCredits failed", err);
        }
      }
      return messageList;
    },
  };

  return { precheck, debit };
}

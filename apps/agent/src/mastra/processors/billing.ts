import { BillingService } from "@aqsha/services/billing";
import { SendQuotaService } from "@aqsha/services/quota";
import type { ProcessInputArgs, ProcessOutputResultArgs } from "@mastra/core/processors";
import { MASTRA_THREAD_ID_KEY } from "@mastra/core/request-context";
import { getServiceDb } from "../lib/db";
import { ownerFromRequestContext } from "../lib/tool-context";

/**
 * Billing/kuota Astra Lite (Fase 1) — menggantikan channel `onMessage` backstop + hook
 * `step.completed` eve.
 *
 * Owner (`MASTRA_RESOURCE_ID_KEY`) + email (`AQSHA_EMAIL_KEY`) dibaca dari RequestContext
 * (diset auth + `userContextMiddleware`) via `ownerFromRequestContext`. threadId dari
 * `MASTRA_THREAD_ID_KEY` bila ada.
 */

/**
 * Pre-check kuota/cooldown OTORITATIF (inputProcessor) — backstop server-side untuk gate ramah
 * di composer (`GET /threads/send-status`). Blok → `abort()` (tripwire) sehingga turn TIDAK
 * jalan; FE memetakan tripwire ke pesan kuota. `normal_chat` (Lite).
 */
export const billingPrecheckProcessor = {
  id: "billing-precheck" as const,
  async processInput({ requestContext, abort, messageList }: ProcessInputArgs) {
    const { id: ownerUserId, email: ownerEmail } = ownerFromRequestContext(requestContext);
    if (!ownerUserId) return messageList;
    const quota = await SendQuotaService.check(getServiceDb(), {
      ownerUserId,
      ownerEmail,
      feature: "normal_chat",
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
 * `consumeCredits` per turn (lebih sederhana dari per-step eve; plan §6). Resume Mastra
 * me-REPLAY stream ter-buffer (tak re-generate) → tak ada double-debit, jadi idempotencyKey
 * tak wajib. Swallow: kegagalan billing tak boleh meracuni turn.
 */
export const billingDebitProcessor = {
  id: "billing-debit" as const,
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
          feature: "normal_chat",
          provider: "openai",
          agentKind: "lite",
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

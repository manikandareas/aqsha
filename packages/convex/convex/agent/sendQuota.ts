import type { MutationCtx } from "../_generated/server";
import { estimateCredits } from "../billing/catalog";
import {
  consumeCredits,
  type EntitlementResult,
} from "../billing/entitlements";
import { rateLimiter } from "../limits";
import { CHAT_PROVIDER_NAME } from "./providers/providers";
import { type AgentKind, chatModelForAgent, deepModelForAgent } from "./models";

// Send-quota gate, shared by BOTH agent backends (legacy agent/messages.ts and
// the SDK backend agent.ts) so rate-limit + billing semantics stay identical
// during dual-run. Extracted to this leaf so agent.ts no longer imports messages.ts
// (which transitively pulls in the entire legacy runtime — plan Step 6 §3d).

export function estimateTokens(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4));
}

export async function checkAndConsumeSendQuota(
  ctx: MutationCtx,
  args: {
    ownerUserId: string;
    ownerEmail?: string | null;
    content: string;
    agentKind: AgentKind;
    isDeep: boolean;
  },
): Promise<
  | { ok: true }
  | { ok: false; retryAt?: number; entitlement?: Extract<EntitlementResult, { ok: false }> }
> {
  const estimatedTokens = estimateTokens(args.content);
  // Deep runs go through the deep_research feature (governed by the monthly
  // deepResearchRuns quota). Lite-deep is allowed on Free (requiredPlan "free");
  // Pro-deep and Pro chat require a paid plan.
  const feature = args.isDeep
    ? "deep_research"
    : args.agentKind === "pro"
      ? "pro_chat"
      : "normal_chat";
  const model = args.isDeep
    ? deepModelForAgent(args.agentKind)
    : chatModelForAgent(args.agentKind);
  const requiredPlan = args.isDeep
    ? args.agentKind === "pro"
      ? ("starter" as const)
      : ("free" as const)
    : args.agentKind === "pro"
      ? ("starter" as const)
      : ("free" as const);
  const entitlement = await consumeCredits(ctx, {
    ownerUserId: args.ownerUserId,
    ownerEmail: args.ownerEmail,
    feature,
    provider: CHAT_PROVIDER_NAME,
    model,
    inputTokens: estimatedTokens,
    totalTokens: estimatedTokens,
    credits: estimateCredits({
      feature,
      inputTokens: estimatedTokens,
      totalTokens: estimatedTokens,
      agentKind: args.agentKind,
    }),
    requiredPlan,
  });
  if (!entitlement.ok) {
    return { ok: false, entitlement };
  }
  const rateChecks = await Promise.all([
    rateLimiter.check(ctx, "sendMessage", { key: args.ownerUserId }),
    rateLimiter.check(ctx, "globalSendMessage"),
    rateLimiter.check(ctx, "globalTokenUsage", { count: estimatedTokens }),
  ]);
  const blocked = rateChecks.find((status) => !status.ok);
  if (blocked && !blocked.ok) {
    return {
      ok: false,
      retryAt: Date.now() + blocked.retryAfter,
    };
  }
  await Promise.all([
    rateLimiter.limit(ctx, "sendMessage", { key: args.ownerUserId }),
    rateLimiter.limit(ctx, "globalSendMessage"),
  ]);
  return { ok: true };
}

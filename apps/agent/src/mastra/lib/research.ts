import { BillingService } from "@aqsha/services/billing";
import type { CreditFeature } from "@aqsha/services/plan";
import { ResearchService } from "@aqsha/services/research";
import type { ResearchCandidate } from "@aqsha/services/research";
import { getServiceDb } from "./db";
import { type AstraToolCtx, callerEmail, threadScopeId, toolCallId } from "./tool-context";

/**
 * Helper riset/billing bersama untuk tool Mastra Astra (port dari eve `agent/lib/tools.ts`).
 */

/**
 * Gerbang + debit kredit untuk satu pemanggilan tool yang merekam usage. IDEMPOTEN saat
 * resume: `idempotencyKey = threadId:toolCallId` stabil per pemanggilan (re-run durable tak
 * double-debit, A9). Return `false` bila kuota habis → tool melapor ke model tanpa menjalankan
 * operasi. `feature` menentukan rate (mis. `external_search`=2 kredit, `citation_verify`=0).
 */
export async function chargeToolUsage(
  ctx: AstraToolCtx,
  args: { ownerUserId: string; feature: CreditFeature; tool: string; provider: string },
): Promise<boolean> {
  const result = await BillingService.consumeCredits(getServiceDb(), {
    ownerUserId: args.ownerUserId,
    ownerEmail: callerEmail(ctx),
    feature: args.feature,
    provider: args.provider,
    threadId: threadScopeId(ctx),
    idempotencyKey: `${threadScopeId(ctx)}:${toolCallId(ctx)}:${args.tool}`,
  });
  return result.ok;
}

/** Wrapper tipis: debit `external_search` (2 kredit) untuk tool riset (search_*). */
export function chargeExternalSearch(
  ctx: AstraToolCtx,
  args: { ownerUserId: string; tool: string; provider: string },
): Promise<boolean> {
  return chargeToolUsage(ctx, { ...args, feature: "external_search" });
}

/**
 * Persist kandidat sumber riset (best-effort) — kegagalan persist tak boleh meracuni hasil
 * tool. `turnId` = `toolCallId` (Mastra tak mengekspos turn id ke tool; per-pemanggilan
 * cukup untuk panel Sources thread).
 */
export async function persistResearch(
  ctx: AstraToolCtx,
  args: { ownerUserId: string; candidates: ResearchCandidate[]; discoveryQuery?: string },
): Promise<void> {
  try {
    await ResearchService.persistSources(getServiceDb(), {
      threadId: threadScopeId(ctx),
      ownerUserId: args.ownerUserId,
      turnId: toolCallId(ctx),
      discoveryQuery: args.discoveryQuery,
      candidates: args.candidates,
      now: Date.now(),
    });
  } catch (err) {
    console.error("[tools] persistResearch failed", err);
  }
}

/** Bentuk hasil tool riset yang dilihat model — bernomor + ringkas untuk sitasi [n]. */
export function toResearchToolOutput(candidates: ResearchCandidate[]): {
  results: Array<{
    n: number;
    title: string;
    url?: string;
    doi?: string;
    arxivId?: string;
    origin: string;
    snippet: string;
  }>;
} {
  return {
    results: candidates.map((c, i) => ({
      n: i + 1,
      title: c.title,
      url: c.url,
      doi: c.doi,
      arxivId: c.arxivId,
      origin: c.origin,
      snippet: c.snippet,
    })),
  };
}

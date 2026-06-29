import { BillingService } from "@aqsha/services/billing";
import type { CreditFeature } from "@aqsha/services/plan";
import { ResearchService } from "@aqsha/services/research";
import type { ResearchCandidate } from "@aqsha/services/research";
import { getServiceDb } from "./db";
import {
  type AstraToolCtx,
  callerEmail,
  chatTurnId,
  deepRunId,
  deepSubQuestion,
  reserveChatCitationOffset,
  threadScopeId,
  toolCallId,
} from "./tool-context";

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
 * Persist kandidat sumber riset (best-effort) — kegagalan persist tak boleh meracuni hasil tool.
 * `turnId` = run id deep-research bila ada (semua sumber satu run berbagi turn → dedupe + penomoran
 * sitasi `[n]` global, G4), jatuh ke `chatTurnId` (turn chat) di jalur biasa supaya sumber satu turn
 * berbagi turn juga. `citationNumbers` (jalur chat) menstempel nomor `[n]` global per-kandidat; deep
 * membiarkan null → di-assign step `assign-citations` (dedup global).
 */
async function persistResearch(
  ctx: AstraToolCtx,
  args: {
    ownerUserId: string;
    candidates: ResearchCandidate[];
    discoveryQuery?: string;
    citationNumbers?: number[];
  },
): Promise<void> {
  try {
    const subQ = deepSubQuestion(ctx);
    await ResearchService.persistSources(getServiceDb(), {
      threadId: threadScopeId(ctx),
      ownerUserId: args.ownerUserId,
      turnId: deepRunId(ctx) ?? chatTurnId(ctx),
      discoveryQuery: args.discoveryQuery,
      ...(subQ ? { subQuestionIndex: subQ.index, subQuestionText: subQ.text } : {}),
      candidates: args.candidates,
      ...(args.citationNumbers ? { citationNumbers: args.citationNumbers } : {}),
      now: Date.now(),
    });
  } catch (err) {
    console.error("[tools] persistResearch failed", err);
  }
}

/**
 * Bentuk hasil tool riset yang dilihat model — bernomor (`n`) + ringkas untuk sitasi `[n]`. `startAt`
 * = offset global per-turn (chat) supaya dua pencarian dalam satu turn tak sama-sama mulai `[1]`.
 */
function toResearchToolOutput(
  candidates: ResearchCandidate[],
  startAt = 0,
): {
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
      n: startAt + i + 1,
      title: c.title,
      url: c.url,
      doi: c.doi,
      arxivId: c.arxivId,
      origin: c.origin,
      snippet: c.snippet,
    })),
  };
}

/**
 * Jalur tunggal nomori+persist+output untuk tool riset (chat & deep). Chat: (1) sabit nomor `[n]`
 * global per-turn (offset dari counter turn), (2) persist `research_sources` membawa nomor itu,
 * (3) kembalikan output bernomor offset SAMA → `[n]` yang dilihat+ditulis model cocok dengan kartu
 * sumber FE. Deep (`deepRunId` ada): offset 0 + `citationNumber` null (di-assign step
 * `assign-citations` belakangan untuk dedup global, G4).
 */
export async function numberPersistAndOutput(
  ctx: AstraToolCtx,
  args: { ownerUserId: string; candidates: ResearchCandidate[]; discoveryQuery?: string },
): Promise<ReturnType<typeof toResearchToolOutput>> {
  const isDeep = deepRunId(ctx) !== null;
  const offset = isDeep ? 0 : reserveChatCitationOffset(ctx, args.candidates.length);
  const citationNumbers = isDeep ? undefined : args.candidates.map((_, i) => offset + i + 1);
  await persistResearch(ctx, {
    ownerUserId: args.ownerUserId,
    candidates: args.candidates,
    discoveryQuery: args.discoveryQuery,
    ...(citationNumbers ? { citationNumbers } : {}),
  });
  return toResearchToolOutput(args.candidates, offset);
}

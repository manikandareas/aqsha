import { BillingService } from "@aqsha/services/billing";
import { estimateCredits, type CreditFeature } from "@aqsha/services/plan";
import { ResearchService, candidateCitationMeta } from "@aqsha/services/research";
import type { ProviderSearchResult, ResearchCandidate } from "@aqsha/services/research";
import { getServiceDb } from "./db";
import {
  type AstraToolCtx,
  callerEmail,
  callerId,
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
 * Gerbang kuota `external_search` NON-consuming (CTX-2): dicek SEBELUM memanggil provider, debit
 * baru terjadi SETELAH provider sukses (`runResearchTool`) → provider error tak menguras kredit.
 */
async function precheckExternalSearch(ctx: AstraToolCtx, ownerUserId: string): Promise<boolean> {
  const gate = await BillingService.requireEntitlement(getServiceDb(), {
    ownerUserId,
    ownerEmail: callerEmail(ctx),
    feature: "external_search",
    credits: estimateCredits({ feature: "external_search" }),
  });
  return gate.ok;
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

/** Satu hasil riset yang dilihat model. `n` HANYA di jalur chat (deep: penomoran global belakangan). */
type ResearchToolResult = {
  n?: number;
  title: string;
  url?: string;
  doi?: string;
  arxivId?: string;
  origin: string;
  /** Penulis (maks 3) dari metadata provider — untuk sitasi/daftar pustaka yang tak dikarang (CTX-8). */
  authors?: string[];
  year?: number;
  venue?: string;
  snippet: string;
};

export type ResearchToolOutput = { results: ResearchToolResult[]; note?: string };

/**
 * Bentuk hasil tool riset yang dilihat model — ringkas + metadata sitasi (authors/year/venue, CTX-8).
 * Chat (`numbered: true`): bernomor `n` global per-turn (`startAt` = offset counter turn) untuk sitasi
 * `[n]`. Deep (`numbered: false`): TANPA `n` — nomor global baru lahir di step `assign-citations`;
 * memberi nomor per-tool di sini membuat `[n]` subagent bertabrakan lalu di-renumber diam-diam (CTX-1).
 */
function toResearchToolOutput(
  candidates: ResearchCandidate[],
  opts: { numbered: boolean; startAt?: number },
): ResearchToolOutput {
  const startAt = opts.startAt ?? 0;
  return {
    results: candidates.map((c, i) => {
      const meta = candidateCitationMeta(c);
      return {
        ...(opts.numbered ? { n: startAt + i + 1 } : {}),
        title: c.title,
        url: c.url,
        doi: c.doi,
        arxivId: c.arxivId,
        origin: c.origin,
        ...(meta.authors.length > 0 ? { authors: meta.authors } : {}),
        ...(meta.year !== null ? { year: meta.year } : {}),
        ...(meta.venue !== null ? { venue: meta.venue } : {}),
        snippet: c.snippet,
      };
    }),
  };
}

/**
 * Jalur tunggal nomori+persist+output untuk tool riset (chat & deep). Chat: (1) sabit nomor `[n]`
 * global per-turn (offset dari counter turn), (2) persist `research_sources` membawa nomor itu,
 * (3) kembalikan output bernomor offset SAMA → `[n]` yang dilihat+ditulis model cocok dengan kartu
 * sumber FE. Deep (`deepRunId` ada): TANPA nomor di output (CTX-1) + `citationNumber` null
 * (di-assign step `assign-citations` belakangan untuk dedup + penomoran global, G4).
 */
export async function numberPersistAndOutput(
  ctx: AstraToolCtx,
  args: { ownerUserId: string; candidates: ResearchCandidate[]; discoveryQuery?: string },
): Promise<ResearchToolOutput> {
  const isDeep = deepRunId(ctx) !== null;
  const offset = isDeep ? 0 : reserveChatCitationOffset(ctx, args.candidates.length);
  const citationNumbers = isDeep ? undefined : args.candidates.map((_, i) => offset + i + 1);
  await persistResearch(ctx, {
    ownerUserId: args.ownerUserId,
    candidates: args.candidates,
    discoveryQuery: args.discoveryQuery,
    ...(citationNumbers ? { citationNumbers } : {}),
  });
  return toResearchToolOutput(args.candidates, { numbered: !isDeep, startAt: offset });
}

/**
 * Alur baku SEMUA tool riset berbayar (CTX-2): gate kuota (non-consuming) → panggil provider →
 * hasil DISKRIMINATIF ke model → debit HANYA saat provider sukses.
 *
 * - Kuota habis → note kuota, tanpa memanggil provider.
 * - Provider error (`ok:false`, termasuk cache backoff `failed` + misconfig) → note error EKSPLISIT
 *   (bukan "tak ada hasil"), TANPA debit — kegagalan tak lagi senyap & tak ditagih.
 * - Sukses tapi kosong → note "benar-benar tak ada hasil" agar model tak salah tafsir.
 * - Race gate→debit (kuota habis persis di antaranya): hasil tetap dikembalikan (user sudah
 *   menunggu provider), debit gagal hanya dicatat — jendela sempit, memihak pengguna.
 */
export async function runResearchTool(
  ctx: AstraToolCtx,
  args: {
    tool: string;
    provider: string;
    discoveryQuery: string;
    search: () => Promise<ProviderSearchResult>;
  },
): Promise<ResearchToolOutput> {
  const ownerUserId = callerId(ctx);
  if (!(await precheckExternalSearch(ctx, ownerUserId))) {
    return { results: [], note: "Kuota pencarian eksternal sudah habis untuk periode ini." };
  }
  const result = await args.search();
  if (!result.ok) {
    return {
      results: [],
      note:
        `Pencarian GAGAL di sisi penyedia — ini BUKAN "tidak ada hasil". ${result.message} ` +
        "Kredit tidak dipotong. Coba tool riset lain, atau sampaikan kendala ini ke pengguna.",
    };
  }
  const charged = await chargeExternalSearch(ctx, {
    ownerUserId,
    tool: args.tool,
    provider: args.provider,
  });
  if (!charged) {
    console.error(`[tools] ${args.tool} debit gagal pasca-sukses provider (race kuota) — hasil tetap dikembalikan`);
  }
  if (result.candidates.length === 0) {
    return {
      results: [],
      note: "Tidak ada hasil untuk kueri ini (penyedia merespons normal). Coba kueri yang berbeda.",
    };
  }
  return numberPersistAndOutput(ctx, {
    ownerUserId,
    candidates: result.candidates,
    discoveryQuery: args.discoveryQuery,
  });
}

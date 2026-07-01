// Lookups for the thread-detail side panels (message sources / search step / step / plan).
//
// The panels live in the thread shell, ABOVE the message list, but resolve detail
// by id from the URL. This pure builder turns the data the chat surface already
// holds — the parsed timeline (`agent.messages`), persisted `research_sources`, and
// the live `/deep` plan gate — into id-keyed lookups the surface registers into
// `ThreadPanelProvider` (see `useRegisterThreadPanelData`). Sources are listed in the
// panels and each links out to its URL — there is no single-source detail view.

import type { AskQuestion, AskQuestionsResumeData } from "@aqsha/chat-core";
import { dedupeCards, researchSourceToCard } from "./source-card";
import type {
  DeepStepDetail,
  SourceCardData,
  TimelineMessage,
  ToolRow,
  ToolStatus,
} from "./timeline-types";
import type { MastraAskGate, MastraPlanGate } from "./mastra-timeline";
import { LIVE_PLAN_KEY } from "@/features/thread-experience/utils/thread-panel-model";
import type { ResearchSource } from "../types";

/** One `/deep` sub-question step — its question + (live or DB) sources, scoped to its run. */
export type SearchStepDetail = {
  turnId: string;
  index: number;
  subQuestion: string;
  status?: ToolStatus;
  sources: SourceCardData[];
};

/** Any other expandable tool step (verify, counter-evidence, normal-chat search, generic tool). */
export type StepDetail = {
  toolCallId: string;
  title: string;
  detail?: DeepStepDetail;
  /** Baris scalar Masukan/Hasil tool biasa — panel menampilkan nilai PENUH (timeline memotong). */
  rows?: ToolRow[];
};

/** The research plan of one run; `resolve` is injected by the surface while a live gate is open. */
export type PlanDetail = {
  turnId: string;
  plan: string;
  subQuestions: string[];
  resolve?: (approve: boolean) => void;
};

/** Live ask-gate (klarifikasi) — questions + resolve, hanya ada satu pada satu waktu. */
export type AskGateDetail = {
  questions: AskQuestion[];
  resolve?: (resume: AskQuestionsResumeData) => void;
  skip?: () => void;
};

export type ThreadPanelLookups = {
  /** Deduped sources per assistant message id (the "Sumber" trigger). */
  messageSources: Map<string, SourceCardData[]>;
  /** Sub-question search steps keyed by `searchKey(turnId, index)` (run-scoped). */
  searches: Map<string, SearchStepDetail>;
  steps: Map<string, StepDetail>;
  /** Research plans keyed by run `turnId` (+ `LIVE_PLAN_KEY` for the live gate). */
  plans: Map<string, PlanDetail>;
  /** Live ask-gate (klarifikasi) untuk panel Questions — `null` bila tak ada. */
  ask: AskGateDetail | null;
};

export const EMPTY_THREAD_PANEL_LOOKUPS: ThreadPanelLookups = {
  messageSources: new Map(),
  searches: new Map(),
  steps: new Map(),
  plans: new Map(),
  ask: null,
};

/** Composite key for a run's sub-question search step (run-scoped → no cross-run conflation). */
export function searchKey(turnId: string, subQuestionIndex: number): string {
  return `${turnId}:${subQuestionIndex}`;
}

/** Source cards aggregated from a message's `search-flat` tool results (normal chat). */
function collectSearchFlatCards(message: TimelineMessage): SourceCardData[] {
  const flat: SourceCardData[] = [];
  for (const p of message.parts) {
    if (p.kind === "tool" && p.model.detail?.kind === "search-flat") {
      flat.push(...p.model.detail.sources);
    }
  }
  return flat;
}

/**
 * Raw (un-deduped) source cards for one assistant message — the SINGLE source of truth shared
 * by the inline "Sumber" trigger (`message-list`) and the side panel (`buildThreadPanelLookups`),
 * so the two never disagree. Precedence: persisted `research_sources` for the message's turn →
 * else the message's own `search-flat` tool cards (normal chat) → else the `/deep` report's
 * numbered sources carried in `metadata.deepProcess.sources` (DB-independent fallback when the
 * live `research_sources` fetch misses). Callers dedupe for the panel and build the citation map.
 */
export function messageSourceCards(
  message: TimelineMessage,
  turnSources: readonly ResearchSource[] | undefined,
): SourceCardData[] {
  if (turnSources && turnSources.length > 0) return turnSources.map(researchSourceToCard);
  const flat = collectSearchFlatCards(message);
  if (flat.length > 0) return flat;
  return message.reportSources ?? [];
}

export function buildThreadPanelLookups(
  messages: readonly TimelineMessage[],
  researchSources: readonly ResearchSource[] | undefined,
  planGate: MastraPlanGate | null,
  askGate: MastraAskGate | null,
): ThreadPanelLookups {
  // research_sources grouped by turn (numbered rows only) — mirrors the surface, so a
  // message's panel sources match the "Sumber" list shown under its answer.
  const sourcesByTurn = new Map<string, ResearchSource[]>();
  for (const s of researchSources ?? []) {
    if (s.citationNumber == null) continue;
    const list = sourcesByTurn.get(s.turnId);
    if (list) list.push(s);
    else sourcesByTurn.set(s.turnId, [s]);
  }

  // Sub-question groups from DB, keyed by (turnId, subQuestionIndex) so two `/deep` runs in one
  // thread don't merge their same-index sub-questions (carries `subQuestionText`).
  const searches = new Map<string, SearchStepDetail>();
  const bySubQ = new Map<string, ResearchSource[]>();
  for (const s of researchSources ?? []) {
    if (s.subQuestionIndex == null) continue;
    const key = searchKey(s.turnId, s.subQuestionIndex);
    const list = bySubQ.get(key);
    if (list) list.push(s);
    else bySubQ.set(key, [s]);
  }
  for (const [, list] of bySubQ) {
    const first = list[0];
    if (!first || first.subQuestionIndex == null) continue;
    searches.set(searchKey(first.turnId, first.subQuestionIndex), {
      turnId: first.turnId,
      index: first.subQuestionIndex,
      subQuestion: first.subQuestionText ?? `Sub-pertanyaan ${first.subQuestionIndex + 1}`,
      sources: list.map(researchSourceToCard),
    });
  }

  const messageSources = new Map<string, SourceCardData[]>();
  const steps = new Map<string, StepDetail>();
  const plans = new Map<string, PlanDetail>();
  // The live gate's plan (resolve injected by the surface) under the sentinel key.
  if (planGate) {
    plans.set(LIVE_PLAN_KEY, {
      turnId: LIVE_PLAN_KEY,
      plan: planGate.plan,
      subQuestions: planGate.subQuestions,
    });
  }

  for (const m of messages) {
    if (m.role === "assistant") {
      const turnSources = m.turnId ? sourcesByTurn.get(m.turnId) : undefined;
      const deduped = dedupeCards(messageSourceCards(m, turnSources));
      if (deduped.length > 0) messageSources.set(m.id, deduped);
    }
    for (const p of m.parts) {
      if (p.kind !== "tool") continue;
      const d = p.model.detail;
      const rows = p.model.rows;
      // Step addressable di panel bila punya detail proses ATAU baris scalar (tool biasa) — supaya
      // nilai panjang yang dipotong di timeline tetap terbaca penuh di panel. plan/search juga
      // punya mode khusus run-scoped (keyed turnId).
      if (!d && rows.length === 0) continue;
      steps.set(p.model.toolCallId, {
        toolCallId: p.model.toolCallId,
        title: p.model.title,
        ...(d ? { detail: d } : {}),
        ...(rows.length > 0 ? { rows } : {}),
      });
      if (!m.turnId) continue;
      if (d?.kind === "plan") {
        plans.set(m.turnId, { turnId: m.turnId, plan: d.plan, subQuestions: d.subQuestions });
      } else if (d?.kind === "search") {
        for (const sub of d.subSearches) {
          const key = searchKey(m.turnId, sub.index);
          const prev = searches.get(key);
          const live = sub.sources ?? [];
          searches.set(key, {
            turnId: m.turnId,
            index: sub.index,
            subQuestion:
              sub.subQuestion || prev?.subQuestion || `Sub-pertanyaan ${sub.index + 1}`,
            status: sub.status,
            sources: live.length > 0 ? live : (prev?.sources ?? []),
          });
        }
      }
    }
  }

  const ask: AskGateDetail | null = askGate ? { questions: askGate.questions } : null;

  return { messageSources, searches, steps, plans, ask };
}

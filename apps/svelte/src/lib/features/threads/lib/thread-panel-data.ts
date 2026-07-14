// Lookups for the thread-detail side panels (message sources / search step / step / plan). Verbatim
// port of `apps/web/features/threads/lib/thread-panel-data.ts` (pure, framework-agnostic). The panels
// live in the thread shell ABOVE the message list but resolve detail by id from the URL. This builder
// turns the parsed timeline + persisted `research_sources` + live `/deep` plan gate into id-keyed
// lookups the surface registers into the panel controller.

import type { AskQuestionsResumeData } from '@aqsha/chat-core';
import type { StatsGroup } from '@aqsha/chat-core/stats-viz';
import { LIVE_PLAN_KEY } from '$lib/features/thread-experience/utils/thread-panel-model';
import type { ThreadStatsGroup } from '../api';
import type { ResearchSource } from '../types';
import type { MastraAskGate, MastraPlanGate } from './mastra-timeline';
import { dedupeCards, researchSourceToCard } from './source-card';
import type {
	DeepStepDetail,
	SourceCardData,
	TimelineMessage,
	ToolRow,
	ToolStatus
} from './timeline-types';

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
	/** Scalar Input/Result rows of a plain tool — the panel shows the FULL value (timeline truncates). */
	rows?: ToolRow[];
};

/** The research plan of one run; `resolve` is injected by the surface while a live gate is open. */
export type PlanDetail = {
	turnId: string;
	plan: string;
	subQuestions: string[];
	resolve?: (approve: boolean) => void;
};

/** Live ask-gate (klarifikasi) — data derived from `MastraAskGate`; resolve/skip injected by surface. */
export type AskGateDetail = Pick<MastraAskGate, 'questions' | 'findings'> & {
	resolve?: (resume: AskQuestionsResumeData) => void;
	skip?: () => void;
};

/** One statistics run in the aggregate Statistik tab — group blocks + the owning message id. */
export type ThreadStatsPanelItem = {
	runKey: string;
	toolCallId: string;
	messageId?: string;
	group: StatsGroup;
};

export type ThreadPanelLookups = {
	messageSources: Map<string, SourceCardData[]>;
	searches: Map<string, SearchStepDetail>;
	steps: Map<string, StepDetail>;
	plans: Map<string, PlanDetail>;
	ask: AskGateDetail | null;
	stats: ThreadStatsPanelItem[];
	statsLoading: boolean;
};

export const EMPTY_THREAD_PANEL_LOOKUPS: ThreadPanelLookups = {
	messageSources: new Map(),
	searches: new Map(),
	steps: new Map(),
	plans: new Map(),
	ask: null,
	stats: [],
	statsLoading: false
};

/** Composite key for a run's sub-question search step (run-scoped → no cross-run conflation). */
export function searchKey(turnId: string, subQuestionIndex: number): string {
	return `${turnId}:${subQuestionIndex}`;
}

/** Source cards aggregated from a message's `search-flat` tool results (normal chat). */
function collectSearchFlatCards(message: TimelineMessage): SourceCardData[] {
	const flat: SourceCardData[] = [];
	for (const p of message.parts) {
		if (p.kind === 'tool' && p.model.detail?.kind === 'search-flat') {
			flat.push(...p.model.detail.sources);
		}
	}
	return flat;
}

/**
 * Raw (un-deduped) source cards for one assistant message — the SINGLE source of truth shared by the
 * inline "Sumber" trigger (message-list) and the side panel, so they never disagree. Precedence:
 * persisted `research_sources` for the turn → the message's own `search-flat` cards (normal chat) →
 * the `/deep` report's numbered sources from `metadata.deepProcess.sources` (DB-independent fallback).
 */
export function messageSourceCards(
	message: TimelineMessage,
	turnSources: readonly ResearchSource[] | undefined
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
	statsGroups: readonly ThreadStatsGroup[] | undefined
): ThreadPanelLookups {
	const sourcesByTurn = new Map<string, ResearchSource[]>();
	for (const s of researchSources ?? []) {
		if (s.citationNumber == null) continue;
		const list = sourcesByTurn.get(s.turnId);
		if (list) list.push(s);
		else sourcesByTurn.set(s.turnId, [s]);
	}

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
			sources: list.map(researchSourceToCard)
		});
	}

	const messageSources = new Map<string, SourceCardData[]>();
	const steps = new Map<string, StepDetail>();
	const plans = new Map<string, PlanDetail>();
	if (planGate) {
		plans.set(LIVE_PLAN_KEY, {
			turnId: LIVE_PLAN_KEY,
			plan: planGate.plan,
			subQuestions: planGate.subQuestions
		});
	}

	const statsByToolCallId = new Map<string, StatsGroup>();
	for (const g of statsGroups ?? []) statsByToolCallId.set(g.toolCallId, g.group);
	const stats: ThreadStatsPanelItem[] = [];

	for (const m of messages) {
		if (m.role === 'assistant') {
			const turnSources = m.turnId ? sourcesByTurn.get(m.turnId) : undefined;
			const deduped = dedupeCards(messageSourceCards(m, turnSources));
			if (deduped.length > 0) messageSources.set(m.id, deduped);
		}
		for (const p of m.parts) {
			if (p.kind !== 'tool') continue;
			const statsGroup = statsByToolCallId.get(p.model.toolCallId);
			if (statsGroup) {
				stats.push({
					runKey: statsGroup.runKey,
					toolCallId: p.model.toolCallId,
					messageId: m.id,
					group: statsGroup
				});
				statsByToolCallId.delete(p.model.toolCallId);
			}
			const d = p.model.detail;
			const rows = p.model.rows;
			if (!d && rows.length === 0) continue;
			steps.set(p.model.toolCallId, {
				toolCallId: p.model.toolCallId,
				title: p.model.title,
				...(d ? { detail: d } : {}),
				...(rows.length > 0 ? { rows } : {})
			});
			if (!m.turnId) continue;
			if (d?.kind === 'plan') {
				plans.set(m.turnId, { turnId: m.turnId, plan: d.plan, subQuestions: d.subQuestions });
			} else if (d?.kind === 'search') {
				for (const sub of d.subSearches) {
					const key = searchKey(m.turnId, sub.index);
					const prev = searches.get(key);
					const live = sub.sources ?? [];
					searches.set(key, {
						turnId: m.turnId,
						index: sub.index,
						subQuestion: sub.subQuestion || prev?.subQuestion || `Sub-pertanyaan ${sub.index + 1}`,
						status: sub.status,
						sources: live.length > 0 ? live : (prev?.sources ?? [])
					});
				}
			}
		}
	}

	const ask: AskGateDetail | null = askGate
		? { questions: askGate.questions, findings: askGate.findings }
		: null;

	for (const [toolCallId, group] of statsByToolCallId) {
		stats.push({ runKey: group.runKey, toolCallId, group });
	}

	const statsLoading = statsGroups === undefined;

	return { messageSources, searches, steps, plans, ask, stats, statsLoading };
}

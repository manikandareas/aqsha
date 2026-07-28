import { errorMessageFrom, lastStepAttempt } from './mastra-timeline';
import type { MastraChunk } from './mastra-timeline';

/**
 * Pure `/deep` Workflow helpers — types, stall detection, terminal-notice/failure derivation, stream
 * iteration, and the thread→runId localStorage map. The imperative driver that consumes these lives on
 * `ThreadAgent`. Framework-agnostic (no runes) — browser DOM only.
 */

export const DEEP_WORKFLOW_ID = 'deep-research';

/** DUR-5: "run stalled" threshold — a non-terminal status with no step-status transition for this long. */
export const DEEP_STALL_MS = 300_000;
/** ISSUE-4: heavy generate phases may sit for minutes; loosen the stall threshold + reassuring copy. */
export const DEEP_HEAVY_STALL_MS = 540_000;

/** Per-phase banner copy for heavy generate phases (key = workflow step id; order = workflow order). */
export const DEEP_HEAVY_STEP_MESSAGE: Record<string, string> = {
	'search-literature': 'Astra sedang menelusuri literatur — tahap ini bisa memakan beberapa menit.',
	'counter-evidence':
		'Astra sedang menimbang bukti tandingan — tahap ini bisa memakan beberapa menit.',
	'analyze-sources': 'Astra sedang menganalisis bukti — tahap ini bisa memakan beberapa menit.',
	synthesize: 'Astra sedang menyusun laporan akhir — tahap ini bisa memakan beberapa menit.'
};
const DEEP_HEAVY_STEPS = Object.keys(DEEP_HEAVY_STEP_MESSAGE);
export const DEEP_STALL_MESSAGE =
	'Riset mendalam tampak macet — tidak ada kemajuan beberapa menit terakhir.';

export const DANGLING_TURN_ERROR =
	'Jawaban sebelumnya terputus sebelum selesai. Kirim ulang pesanmu bila perlu.';

/** Workflow run handle (subset of client-js used) — stream/resume/observe = `ReadableStream` of chunks. */
export type DeepRun = {
	readonly runId: string;
	stream: (p: {
		inputData: Record<string, unknown>;
		closeOnSuspend?: boolean;
	}) => Promise<ReadableStream<MastraChunk>>;
	resumeStream: (p: {
		step?: string | string[];
		resumeData?: Record<string, unknown>;
	}) => Promise<ReadableStream<MastraChunk>>;
	observe: (p?: { offset?: number }) => Promise<ReadableStream<MastraChunk>>;
	cancel: () => Promise<unknown>;
	restart: (p: Record<string, unknown>) => Promise<unknown>;
	timeTravelStream: (p: { step: string | string[] }) => Promise<ReadableStream<MastraChunk>>;
};

/** Shape of `runById().steps[id]` used by re-attach + terminal reconciliation (loose subset). */
export type WorkflowStepsSnapshot = Record<
	string,
	{ status?: unknown; output?: unknown; suspendPayload?: Record<string, unknown>; error?: unknown }
>;

/** `runById()` snapshot (subset the FE uses) — one shape for poll re-attach + reconcile + status probe. */
export type DeepRunSnapshot = {
	status?: string;
	steps?: WorkflowStepsSnapshot;
	/** B3: `bail()` payload (run success) — source of the notice `reason`. */
	result?: Record<string, unknown>;
};

export type DeepFailure = {
	runId: string;
	/** Failed step (time-travel target); null when not identified from the snapshot. */
	stepId: string | null;
	/** Step error message (best-effort from the snapshot) for the card. */
	message: string | null;
};

export type DeepNotice = { runId: string; reason: string };

/** Running heavy generate step in a poll snapshot — source of per-phase copy + loosened stall gate. */
export function activeHeavyDeepStep(steps: WorkflowStepsSnapshot): string | null {
	for (const id of DEEP_HEAVY_STEPS) {
		const status = String(steps[id]?.status ?? '');
		if (status === 'running' || status === 'pending' || status === 'waiting') return id;
	}
	return null;
}

/** B3: terminal notice from a run `result` (bail payload persisted as `success`). Only `blocked` renders. */
export function deepNoticeFromResult(runId: string, result: unknown): DeepNotice | null {
	if (!result || typeof result !== 'object') return null;
	const r = result as { status?: unknown; reason?: unknown };
	if (r.status !== 'blocked') return null;
	const reason =
		typeof r.reason === 'string' && r.reason ? r.reason : 'Run dihentikan tanpa alasan terekam.';
	return { runId, reason };
}

/** B1: find the failed step (time-travel target) + its message from a `failed` run snapshot. */
export function deepFailureFromSteps(runId: string, steps: WorkflowStepsSnapshot): DeepFailure {
	for (const [stepId, rawEntry] of Object.entries(steps)) {
		const st = lastStepAttempt<WorkflowStepsSnapshot[string]>(
			rawEntry as WorkflowStepsSnapshot[string] | WorkflowStepsSnapshot[string][]
		);
		if (String(st?.status ?? '') !== 'failed') continue;
		return { runId, stepId, message: errorMessageFrom(st?.error) };
	}
	return { runId, stepId: null, message: null };
}

/** Iterate a `ReadableStream` via reader (async-iterator ReadableStream not universal in browsers). */
export async function* iterateStream<T>(stream: ReadableStream<T>): AsyncGenerator<T> {
	const reader = stream.getReader();
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value !== undefined) yield value;
		}
	} finally {
		reader.releaseLock();
	}
}

// thread→active `/deep` runId map (localStorage) — client-js has no get-run-by-thread, so the FE stores
// it for re-attach / plan-gate rehydrate on refresh. In-memory fallback ONLY when `setItem` fails.
const deepRunKey = (threadId: string) => `aqsha:deep-run:${threadId}`;
const deepRunMem = new Map<string, string>();

export function getDeepRunId(threadId: string): string | null {
	if (typeof window === 'undefined') return null;
	try {
		return window.localStorage.getItem(deepRunKey(threadId)) ?? deepRunMem.get(threadId) ?? null;
	} catch {
		return deepRunMem.get(threadId) ?? null;
	}
}

export function setDeepRunId(threadId: string, runId: string): void {
	try {
		window.localStorage.setItem(deepRunKey(threadId), runId);
		deepRunMem.delete(threadId);
	} catch {
		deepRunMem.set(threadId, runId);
	}
}

export function clearDeepRunId(threadId: string): void {
	deepRunMem.delete(threadId);
	try {
		window.localStorage.removeItem(deepRunKey(threadId));
	} catch {
		/* no-op */
	}
}

/** Run statuses still worth re-attaching to (not yet terminal). */
const DEEP_ALIVE_STATUSES = new Set(['running', 'suspended', 'waiting', 'pending', 'paused']);

/**
 * DUR-2: discover an active `/deep` run from the SERVER — fallback when localStorage is empty
 * (cross-device / incognito / cleared). `ListWorkflowRunsParams` has no `threadId` filter, so: list
 * runs by `resourceId` (stamped by `sendDeep`) then match `threadId` from the snapshot input.
 * Best-effort — failure/absent → `null`.
 */
export async function discoverDeepRunId(
	client: { getWorkflow: (id: string) => unknown },
	threadId: string,
	resourceId: string
): Promise<string | null> {
	try {
		const wf = client.getWorkflow(DEEP_WORKFLOW_ID) as {
			runs: (p: Record<string, unknown>) => Promise<unknown>;
		};
		const res = (await wf.runs({
			resourceId,
			fromDate: new Date(Date.now() - 48 * 60 * 60 * 1000),
			perPage: 25
		})) as { runs?: Array<Record<string, unknown>> };
		let best: { runId: string; updatedAt: number } | null = null;
		for (const run of res.runs ?? []) {
			const runId = typeof run.runId === 'string' ? run.runId : null;
			if (!runId) continue;
			let snap: unknown = run.snapshot;
			if (typeof snap === 'string') {
				try {
					snap = JSON.parse(snap);
				} catch {
					continue;
				}
			}
			const s = (snap ?? {}) as {
				status?: unknown;
				context?: { input?: { threadId?: unknown } };
				input?: { threadId?: unknown };
			};
			if (!DEEP_ALIVE_STATUSES.has(String(s.status ?? ''))) continue;
			const snapThreadId = s.context?.input?.threadId ?? s.input?.threadId;
			if (snapThreadId !== threadId) continue;
			const updatedAt = Date.parse(String(run.updatedAt ?? '')) || 0;
			if (!best || updatedAt > best.updatedAt) best = { runId, updatedAt };
		}
		return best?.runId ?? null;
	} catch {
		return null;
	}
}

// Timeline reducer — PURE TypeScript, no runes (framework-agnostic per plan §3.4/§8.5).
//
// Phase 1 connected-slice port of the chat path in
// `apps/web/features/threads/lib/mastra-timeline.ts`. It is intentionally a MINIMAL subset:
// only the normal-chat streaming chunks (`start` / text / reasoning / tool / `finish` / `abort` /
// `error`) needed to prove dealbreaker #2 (live Mastra streaming, token-by-token, no dup/lost).
// The full `/deep` workflow adapter, HITL gates, and queueing are Phase 6/7, not the gate.
//
// `createChunkReplayFilter` is ported verbatim because it is the mechanism that guarantees
// idempotency: `subscribeToThread` replays the in-flight run buffer from index 0 on every
// (re)connect, and `text-delta` append is non-idempotent, so replayed chunks must be dropped
// before they reach the reducer.

/** Raw chunk shape from `subscribeToThread`/`sendMessage` stream (`@mastra/core` 1.x). */
export type MastraChunk = { type: string; runId?: string; payload?: Record<string, unknown> };

export type Part =
	| { kind: 'text'; id: string; text: string; streaming: boolean }
	| { kind: 'reasoning'; id: string; text: string; thinking: boolean }
	| { kind: 'tool'; id: string; name: string; status: 'running' | 'completed' | 'failed' };

export type Message = {
	id: string;
	role: 'user' | 'assistant';
	streaming: boolean;
	parts: Part[];
};

export type TimelineState = {
	status: 'ready' | 'submitted' | 'streaming';
	messages: Message[];
	error?: string;
};

export const initialTimeline = (messages: Message[] = []): TimelineState => ({
	status: 'ready',
	messages
});

// ── small value coercers (mirror mastra-timeline `str`/`strId`) ─────────────────────────────
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
let partSeq = 0;
/** Stable-ish id for a streamed part; falls back to a monotonic local id when the chunk omits it. */
const strId = (v: unknown): string => (typeof v === 'string' && v ? v : `p:${(partSeq += 1)}`);

const streaming = (s: TimelineState): TimelineState =>
	s.status === 'streaming' ? s : { ...s, status: 'streaming' };

/**
 * Ensure the tail message is a streaming assistant we can append parts to. Returns the (possibly
 * new) state plus the index of that assistant message. Mirrors `ensureActiveAssistant`: on a fresh
 * turn (or resume/replay where no optimistic placeholder exists) it creates one.
 */
function ensureActiveAssistant(state: TimelineState): [TimelineState, number] {
	const last = state.messages[state.messages.length - 1];
	if (last && last.role === 'assistant' && last.streaming) {
		return [state, state.messages.length - 1];
	}
	const msg: Message = {
		id: `a:${Date.now()}:${partSeq++}`,
		role: 'assistant',
		streaming: true,
		parts: []
	};
	return [{ ...state, messages: [...state.messages, msg] }, state.messages.length];
}

/** Replace message at `idx` via `fn` (immutable). */
function patchMessage(
	state: TimelineState,
	idx: number,
	fn: (m: Message) => Message
): TimelineState {
	const messages = state.messages.slice();
	const m = messages[idx];
	if (!m) return state;
	messages[idx] = fn(m);
	return { ...state, messages };
}

/** Append text to the text/reasoning part with `partId` (create it if new). Non-idempotent. */
function appendText(
	state: TimelineState,
	idx: number,
	kind: 'text' | 'reasoning',
	partId: string,
	text: string
): TimelineState {
	if (!text) return state;
	return patchMessage(state, idx, (m) => {
		const parts = m.parts.slice();
		const pIdx = parts.findIndex((p) => p.kind === kind && p.id === partId);
		if (pIdx >= 0) {
			const prev = parts[pIdx] as Extract<Part, { kind: 'text' | 'reasoning' }>;
			parts[pIdx] = { ...prev, text: prev.text + text };
		} else if (kind === 'text') {
			parts.push({ kind: 'text', id: partId, text, streaming: true });
		} else {
			parts.push({ kind: 'reasoning', id: partId, text, thinking: true });
		}
		return { ...m, parts };
	});
}

/** Create an empty text/reasoning part (idempotent on `partId`). */
function upsertEmptyPart(
	state: TimelineState,
	idx: number,
	kind: 'text' | 'reasoning',
	partId: string
): TimelineState {
	return patchMessage(state, idx, (m) => {
		if (m.parts.some((p) => p.kind === kind && p.id === partId)) return m;
		const part: Part =
			kind === 'text'
				? { kind: 'text', id: partId, text: '', streaming: true }
				: { kind: 'reasoning', id: partId, text: '', thinking: true };
		return { ...m, parts: [...m.parts, part] };
	});
}

function upsertToolPart(
	state: TimelineState,
	idx: number,
	toolCallId: string,
	name: string,
	status: 'running' | 'completed' | 'failed'
): TimelineState {
	const id = toolCallId || `t:${partSeq++}`;
	return patchMessage(state, idx, (m) => {
		const parts = m.parts.slice();
		const pIdx = parts.findIndex((p) => p.kind === 'tool' && p.id === id);
		if (pIdx >= 0) {
			parts[pIdx] = {
				kind: 'tool',
				id,
				name: name || (parts[pIdx] as { name: string }).name,
				status
			};
		} else {
			parts.push({ kind: 'tool', id, name, status });
		}
		return { ...m, parts };
	});
}

/** Optimistic turn start: append the user bubble + a fresh streaming assistant placeholder. */
export function startAssistantTurn(state: TimelineState, userDisplay: string): TimelineState {
	const userMsg: Message = {
		id: `u:${Date.now()}:${partSeq++}`,
		role: 'user',
		streaming: false,
		parts: [{ kind: 'text', id: `ut:${partSeq++}`, text: userDisplay, streaming: false }]
	};
	const assistant: Message = {
		id: `a:${Date.now()}:${partSeq++}`,
		role: 'assistant',
		streaming: true,
		parts: []
	};
	return { ...state, status: 'submitted', messages: [...state.messages, userMsg, assistant] };
}

/** Terminal settle: last assistant + its parts stop streaming; status → ready. */
export function settleAssistantTurn(state: TimelineState): TimelineState {
	const messages = state.messages.slice();
	for (let i = messages.length - 1; i >= 0; i -= 1) {
		if (messages[i]!.role !== 'assistant') continue;
		const m = messages[i]!;
		messages[i] = {
			...m,
			streaming: false,
			parts: m.parts.map((p) =>
				p.kind === 'text'
					? { ...p, streaming: false }
					: p.kind === 'reasoning'
						? { ...p, thinking: false }
						: p
			)
		};
		break;
	}
	return { ...state, status: 'ready', messages };
}

/** Reason from a `finish` chunk (`payload.stepResult.reason` or `payload.reason`). */
function finishReason(payload: Record<string, unknown>): string {
	const stepResult = payload.stepResult;
	if (stepResult && typeof stepResult === 'object' && 'reason' in stepResult) {
		return str((stepResult as { reason?: unknown }).reason);
	}
	return str(payload.reason);
}

/**
 * Reduce one chunk into the timeline. Handles the normal-chat chunk vocabulary. Unknown chunk
 * types are ignored (defensive — the durable stream carries workflow/HITL chunks too).
 */
export function reduceChunk(state: TimelineState, chunk: MastraChunk): TimelineState {
	const payload = chunk.payload ?? {};
	switch (chunk.type) {
		case 'start':
		case 'step-start': {
			const [next] = ensureActiveAssistant(streaming(state));
			return next;
		}
		case 'text-start': {
			const [s, idx] = ensureActiveAssistant(streaming(state));
			return upsertEmptyPart(s, idx, 'text', strId(payload.id));
		}
		case 'text-delta': {
			const [s, idx] = ensureActiveAssistant(streaming(state));
			return appendText(s, idx, 'text', strId(payload.id), str(payload.text));
		}
		case 'reasoning-start': {
			const [s, idx] = ensureActiveAssistant(streaming(state));
			return upsertEmptyPart(s, idx, 'reasoning', strId(payload.id));
		}
		case 'reasoning-delta': {
			const [s, idx] = ensureActiveAssistant(streaming(state));
			return appendText(s, idx, 'reasoning', strId(payload.id), str(payload.text));
		}
		case 'reasoning-end': {
			const [s, idx] = ensureActiveAssistant(streaming(state));
			return patchMessage(s, idx, (m) => ({
				...m,
				parts: m.parts.map((p) =>
					p.kind === 'reasoning' && p.id === strId(payload.id) ? { ...p, thinking: false } : p
				)
			}));
		}
		case 'tool-call-input-streaming-start':
		case 'tool-call': {
			const [s, idx] = ensureActiveAssistant(streaming(state));
			return upsertToolPart(s, idx, str(payload.toolCallId), str(payload.toolName), 'running');
		}
		case 'tool-result':
		case 'tool-output': {
			const [s, idx] = ensureActiveAssistant(state);
			return upsertToolPart(
				s,
				idx,
				str(payload.toolCallId),
				str(payload.toolName),
				payload.isError === true ? 'failed' : 'completed'
			);
		}
		case 'tool-error': {
			const [s, idx] = ensureActiveAssistant(state);
			return upsertToolPart(s, idx, str(payload.toolCallId), str(payload.toolName), 'failed');
		}
		case 'finish': {
			// reason=tool-calls ⇒ more steps pending, keep streaming; otherwise the turn is done.
			if (finishReason(payload) === 'tool-calls') return state;
			return settleAssistantTurn(state);
		}
		case 'abort':
			return settleAssistantTurn(state);
		case 'error': {
			const settled = settleAssistantTurn(state);
			const errText = str((payload.error as { message?: unknown })?.message) || str(payload.error);
			return { ...settled, error: errText || 'Terjadi kesalahan saat menstreaming jawaban.' };
		}
		default:
			return state;
	}
}

/**
 * Per-run replay dedup filter — ported verbatim from `mastra-timeline.createChunkReplayFilter`.
 * The single long-lived `subscribeToThread` replays each in-flight run's buffer from index 0 on
 * every (re)connect (refresh, network blip, resubscribe). `text-delta` append is non-idempotent,
 * so replayed chunks must be dropped. Matches a prefix signature per run; divergence (e.g. resume
 * after suspend, reusing the runId) is treated as new. Terminal runs are forgotten (frees memory).
 * This is the guarantee behind "no duplicate / no lost tokens".
 */
export function createChunkReplayFilter(): (chunk: MastraChunk) => boolean {
	const runs = new Map<string, { applied: string[]; cursor: number }>();
	const sigOf = (chunk: MastraChunk): string => {
		try {
			return `${chunk.type}:${JSON.stringify(chunk.payload ?? null)}`;
		} catch {
			return `${chunk.type}:?`; // unserializable payload (e.g. circular) → never skip
		}
	};
	const isTerminal = (chunk: MastraChunk): boolean => {
		if (chunk.type === 'abort' || chunk.type === 'error') return true;
		if (chunk.type !== 'finish') return false;
		const payload = chunk.payload ?? {};
		const stepResult = payload.stepResult;
		const reason =
			stepResult && typeof stepResult === 'object' && 'reason' in stepResult
				? str((stepResult as { reason?: unknown }).reason)
				: str(payload.reason);
		return reason !== 'tool-calls';
	};
	return (chunk) => {
		const runId = chunk.runId;
		if (!runId || !chunk.type) return true;
		let run = runs.get(runId);
		if (!run) {
			run = { applied: [], cursor: 0 };
			runs.set(runId, run);
		}
		const sig = sigOf(chunk);
		if (chunk.type === 'start') {
			const idx = run.applied.indexOf(sig);
			run.cursor = idx >= 0 ? idx : run.applied.length;
		}
		if (run.cursor < run.applied.length) {
			if (run.applied[run.cursor] === sig) {
				run.cursor += 1;
				return false; // duplicate replay — already applied
			}
			run.cursor = run.applied.length; // divergence from prefix → not a pure replay
		}
		run.applied.push(sig);
		run.cursor = run.applied.length;
		if (isTerminal(chunk)) runs.delete(runId);
		return true;
	};
}

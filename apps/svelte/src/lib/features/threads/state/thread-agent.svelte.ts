import type { MastraClient } from '@mastra/client-js';
import type { QueryClient } from '@tanstack/svelte-query';
import type { AgentKind, AskQuestionsResumeData } from '@aqsha/chat-core';
import { readableApiErrorMessage } from '$lib/errors';
import { queryKeys } from '$lib/query';
import { agentIdFor } from '../lib/mastra-client';
import { createChunkReplayFilter } from '../lib/chunk-replay';
import {
	dropLastTurn,
	initialMastraTimeline,
	type MastraApproval,
	type MastraAskGate,
	type MastraChunk,
	type MastraPlanGate,
	type MastraStatus,
	type MastraTimelineState,
	reduceMastraChunk,
	settleAssistantTurn,
	startAssistantTurn,
	startRegenerate
} from '../lib/mastra-timeline';
import type { TimelineMessage } from '../lib/timeline-types';

// ── THC-5: durable-thread chat agent as a Svelte 5 runes state class ─────────────────────────────
//
// Port of the CHAT spine of `apps/web/features/threads/lib/use-mastra-agent.ts`. One long-lived
// `subscribeToThread` receives all runs for a thread; chat chunks reduce through `reduceMastraChunk`.
// State that reduces per chunk is `$state`; the derived tier is `$derived`; handles/registries/replay
// are plain (non-reactive) private fields (NOT `$state` — they must survive without re-init and never
// leak across users under SSR, §3.5). Reactivity rules (§3.4): the subscription lifecycle is owned
// imperatively by this class (`start()`/`destroy()` from the consuming `$effect`), NOT a per-field
// `$effect` reflex; `committedAgentKind` is the only `$derived`.
//
// PHASE BOUNDARY: the `/deep` durable Workflow orchestration (sendDeep / consumeWorkflow / runById
// re-attach poll / plan+ask workflow resume / failure-recovery) is Phase 7 (THX-5). The workflow
// REDUCERS (`reduceWorkflowChunk`, `seedWorkflowProgress`, `settleWorkflowTurn`, `reviveWorkflowTurn`)
// are already ported+tested in `mastra-timeline.ts`; Phase 7 wires the imperative driver onto this
// same class. Everything here — subscription, replay/idempotency, reconnect, send, queue-while-busy,
// stop, regenerate, HITL tool approval + ask-resume — is the complete chat engine and the substrate.

/** Subscription handle from `agent.subscribeToThread` (subset used here). */
type ThreadSubscription = {
	processDataStream: (o: {
		onChunk: (c: unknown) => void;
		reconnect?: boolean | { maxRetries?: number; delayMs?: number };
	}) => Promise<void>;
	abort: () => Promise<boolean>;
	unsubscribe: () => void;
};

/** A message held while a run is active, re-sent when the thread returns to `ready` (DUR-6, chat). */
type QueuedSend = {
	id: string;
	text: string;
	display: string;
	clientContext?: string[];
	attachmentIds?: string[];
	agentKind: AgentKind;
};

/** Context of the last-sent turn, for regenerate (FE-8). */
type LastSentTurn = {
	text: string;
	clientContext?: string[];
	richText?: string;
	attachmentIds?: string[];
	agentKind: AgentKind;
};

export type SendOptions = {
	clientContext?: string[];
	richText?: string;
	attachmentIds?: string[];
	agentKind?: AgentKind;
};

export type ThreadAgentOptions = {
	/** Same MastraClient across the thread; the tier only selects which agent id we subscribe to. */
	getClient: () => MastraClient;
	threadId: string;
	/** Reactive resource id (Clerk userId) — may be null until clerk-js loads (gate on `isLoaded`). */
	getResourceId: () => string | null | undefined;
	queryClient: QueryClient;
	/** Stored thread tier (`chat_threads.agent_kind`); the subscription follows this before any send. */
	initialAgentKind?: AgentKind;
	seed?: TimelineMessage[];
	/**
	 * Callback for a settled `request_document_edit` tool (paid side-effect, deduped per tool-call).
	 * Wired to the BlockNote AI editor in Phase 10; a no-op until then.
	 */
	onRequestDocumentEdit?: (edit: { artifactId: string; instruction: string }) => void;
};

const SUBSCRIBE_DEGRADED_ERROR =
	'Koneksi ke Astra tidak stabil. Jawaban mungkin tertunda; kami mencoba menyambung ulang.';

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

let queuedSeq = 0;

/** Last user message text in the timeline (for regenerate). */
function lastUserText(messages: readonly TimelineMessage[]): string | null {
	for (let i = messages.length - 1; i >= 0; i -= 1) {
		const msg = messages[i];
		if (msg?.role !== 'user') continue;
		const text = msg.parts
			.filter((p) => p.kind === 'text')
			.map((p) => (p as { text: string }).text)
			.join('\n')
			.trim();
		return text || null;
	}
	return null;
}

type ServerMessageLike = { id: string; role?: string };

/**
 * Ids of the last [user, assistant] pair in server memory (to delete on regenerate). Durable-thread
 * `sendMessage` stores user input as a SIGNAL (`role:"signal"`, NOT `role:"user"`), so matching by
 * `role==="user"` would MISS it → a duplicate user bubble after refresh (G6). Match POSITIONALLY:
 * remove the last assistant + all non-assistant messages just before it, regardless of role label.
 * Verbatim port of `lastTurnMessageIds` in `use-mastra-agent.ts`.
 */
export function lastTurnMessageIds(messages: readonly ServerMessageLike[]): string[] {
	let lastAssistant = -1;
	for (let i = messages.length - 1; i >= 0; i -= 1) {
		if (messages[i]!.role === 'assistant') {
			lastAssistant = i;
			break;
		}
	}
	// Dangling turn: messages after the last assistant (e.g. a `deep-user:<runId>` from a failed run,
	// whose answer was never persisted). Drop ONLY the last dangling turn (the trailing user/signal +
	// what follows), never older dangling turns or the whole history when there is no assistant yet.
	const tail = messages.slice(lastAssistant + 1);
	if (tail.length > 0) {
		let start = 0;
		for (let i = tail.length - 1; i >= 0; i -= 1) {
			const role = tail[i]!.role;
			if (role === 'user' || role === 'signal') {
				start = i;
				break;
			}
		}
		return tail.slice(start).map((m) => m.id);
	}
	if (lastAssistant < 0) return [];
	const ids: string[] = [messages[lastAssistant]!.id];
	for (let i = lastAssistant - 1; i >= 0; i -= 1) {
		if (messages[i]!.role === 'assistant') break;
		ids.push(messages[i]!.id);
	}
	return ids;
}

export class ThreadAgent {
	readonly #getClient: () => MastraClient;
	readonly #threadId: string;
	readonly #getResourceId: () => string | null | undefined;
	readonly #qc: QueryClient;
	readonly #initialAgentKind: AgentKind;
	readonly #onRequestDocumentEdit?: (edit: { artifactId: string; instruction: string }) => void;

	// Reactive state (reduces per chunk / drives the UI).
	#timeline = $state<MastraTimelineState>(initialMastraTimeline());
	#sentKind = $state<AgentKind | null>(null);
	#queued = $state<QueuedSend[]>([]);

	/**
	 * Tier the subscription follows: the active turn's tier once sent, else the stored thread tier. A
	 * reactive getter (not a `$derived` field) because it reads the constructor-assigned
	 * `#initialAgentKind`; reading the `$state` `#sentKind` inside the getter keeps it reactive.
	 */
	get committedAgentKind(): AgentKind {
		return this.#sentKind ?? this.#initialAgentKind;
	}

	// Non-reactive handles / registries / buffers.
	#sub: ThreadSubscription | null = null;
	#replay = createChunkReplayFilter();
	#cancelled = false;
	#started = false;
	#subEpoch = 0;
	#prevStatus: MastraStatus = 'ready';
	#pendingDeltas: MastraChunk[] = [];
	#deltaFlushScheduled = false;
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive dedup registry (never read reactively)
	#docEditKeys = new Set<string>();
	#dispatchingQueue = false;
	#lastSend: LastSentTurn | null = null;

	constructor(opts: ThreadAgentOptions) {
		this.#getClient = opts.getClient;
		this.#threadId = opts.threadId;
		this.#getResourceId = opts.getResourceId;
		this.#qc = opts.queryClient;
		this.#initialAgentKind = opts.initialAgentKind ?? 'lite';
		this.#onRequestDocumentEdit = opts.onRequestDocumentEdit;
		this.#timeline = initialMastraTimeline(opts.seed ?? []);
	}

	// ── reactive getters (the UI reads these) ──────────────────────────────────────────────────────
	get messages(): TimelineMessage[] {
		return this.#timeline.messages;
	}
	get status(): MastraStatus {
		return this.#timeline.status;
	}
	get error(): string | undefined {
		return this.#timeline.error;
	}
	get approvals(): MastraApproval[] {
		return this.#timeline.approvals;
	}
	get planGate(): MastraPlanGate | null {
		return this.#timeline.planGate ?? null;
	}
	get askGate(): MastraAskGate | null {
		return this.#timeline.askGate ?? null;
	}
	get queued(): QueuedSend[] {
		return this.#queued;
	}

	// ── subscription lifecycle (E1) ────────────────────────────────────────────────────────────────

	/** Begin the single long-lived subscription. Idempotent; call once from the consuming `$effect`. */
	start(): void {
		if (this.#started) return;
		this.#started = true;
		void this.#subscribeLoop();
	}

	/** Tear down the subscription (call from the `$effect` cleanup / on unmount). */
	destroy(): void {
		this.#cancelled = true;
		this.#subEpoch += 1;
		this.#sub?.unsubscribe();
		this.#sub = null;
	}

	/**
	 * Two-layered reconnect: client-js internal retry ({maxRetries:20}) plus this outer re-subscribe
	 * loop that re-runs after retries exhaust or the stream ends. Re-reads `committedAgentKind` each
	 * iteration so a lite→pro commit re-subscribes to the `astra-pro` channel (buffer replay + the
	 * replay filter close the race). Self-heals: a brand-new thread has nothing to subscribe to until
	 * the first `sendMessage`, so subscribe failures just retry (silent until the thread has messages).
	 */
	async #subscribeLoop(): Promise<void> {
		let failures = 0;
		while (!this.#cancelled) {
			const resourceId = this.#getResourceId();
			if (!resourceId) {
				await delay(300); // wait for clerk-js (userId + real bearer) before subscribing
				continue;
			}
			const myEpoch = this.#subEpoch;
			try {
				const agent = this.#getClient().getAgent(agentIdFor(this.committedAgentKind));
				const sub = (await agent.subscribeToThread({
					threadId: this.#threadId,
					resourceId
				})) as unknown as ThreadSubscription;
				if (this.#cancelled || myEpoch !== this.#subEpoch) {
					sub.unsubscribe();
					continue; // torn down / tier changed while awaiting → drop this sub and re-loop
				}
				this.#sub = sub;
				failures = 0;
				this.#clearDegraded();
				await sub.processDataStream({
					onChunk: this.#onChunk,
					reconnect: { maxRetries: 20, delayMs: 1000 }
				});
				if (this.#cancelled) return;
				if (myEpoch !== this.#subEpoch) continue; // tier committed → re-subscribe immediately
				await delay(1000); // stream ended unexpectedly → wait then re-subscribe
			} catch (err) {
				if (this.#cancelled) return;
				this.#noteFailure((failures += 1), err);
				await delay(1000);
			}
		}
	}

	/** After a lite→pro commit, cycle the subscription so it follows the new agent channel. */
	#cycleSubscription(): void {
		this.#subEpoch += 1;
		this.#sub?.unsubscribe();
		this.#sub = null;
	}

	#noteFailure(attempt: number, err: unknown): void {
		if (this.#timeline.messages.length === 0) return; // new thread pre-send → normal, stay silent
		console.warn('[astra] langganan thread gagal', { attempt, threadId: this.#threadId, err });
		if (attempt >= 3 && this.#timeline.error !== SUBSCRIBE_DEGRADED_ERROR) {
			this.#timeline = { ...this.#timeline, error: SUBSCRIBE_DEGRADED_ERROR };
		}
	}

	#clearDegraded(): void {
		if (this.#timeline.error === SUBSCRIBE_DEGRADED_ERROR) {
			this.#timeline = { ...this.#timeline, error: undefined };
		}
	}

	// ── chunk router (chat) + high-frequency delta batching (IMP-10) ───────────────────────────────

	#onChunk = (chunk: unknown): void => {
		const c0 = chunk as MastraChunk;
		if (!this.#replay(c0)) return; // duplicate replay (FE-2) → drop before the non-idempotent reducer
		if (c0?.type === 'text-delta' || c0?.type === 'reasoning-delta') {
			this.#pendingDeltas.push(c0);
			if (!this.#deltaFlushScheduled) {
				this.#deltaFlushScheduled = true;
				if (
					typeof requestAnimationFrame === 'function' &&
					typeof document !== 'undefined' &&
					document.visibilityState === 'visible'
				) {
					requestAnimationFrame(() => this.#flushDeltas());
				} else {
					setTimeout(() => this.#flushDeltas(), 32);
				}
			}
			return;
		}
		// Structural chunk: flush buffered deltas first so state order == stream order.
		this.#flushDeltas();
		this.#apply((s) => reduceMastraChunk(s, c0));
		this.#detectDocumentEdit(c0);
		this.#afterStructural();
	};

	#flushDeltas(): void {
		this.#deltaFlushScheduled = false;
		const batch = this.#pendingDeltas;
		if (batch.length === 0) return;
		this.#pendingDeltas = [];
		this.#apply((s) => batch.reduce((acc, c) => reduceMastraChunk(acc, c), s));
		this.#afterStructural();
	}

	/** Apply a reducer step + surface a settle→invalidate edge (E2) without an `$effect` reflex. */
	#apply(fn: (s: MastraTimelineState) => MastraTimelineState): void {
		this.#timeline = fn(this.#timeline);
	}

	/** On a `!ready → ready` transition, invalidate the thread's server-derived caches (E2). */
	#afterStructural(): void {
		const now = this.#timeline.status;
		if (this.#prevStatus !== 'ready' && now === 'ready') {
			void this.#qc.invalidateQueries({ queryKey: queryKeys.threads.all });
			void this.#qc.invalidateQueries({ queryKey: queryKeys.threads.statsBlocks(this.#threadId) });
			void this.#qc.invalidateQueries({ queryKey: queryKeys.threads.artifacts(this.#threadId) });
			void this.#qc.invalidateQueries({ queryKey: queryKeys.threads.sources(this.#threadId) });
		}
		this.#prevStatus = now;
		this.#maybeDispatchQueue();
	}

	/**
	 * `request_document_edit` settle → publish to the doc-edit callback ONCE per tool-call (paid
	 * side-effect guard, a second layer under the replay filter). Verbatim of the web onChunk branch.
	 */
	#detectDocumentEdit(c: MastraChunk): void {
		if (c?.type !== 'tool-result' && c?.type !== 'tool-output') return;
		const payload = c.payload ?? {};
		if (payload.toolName !== 'request_document_edit') return;
		const result = (payload.result ?? payload.output) as
			{ ok?: unknown; artifactId?: unknown; instruction?: unknown } | undefined;
		const artifactId = typeof result?.artifactId === 'string' ? result.artifactId : null;
		const instruction = typeof result?.instruction === 'string' ? result.instruction : null;
		if (result?.ok !== true || !artifactId || !instruction) return;
		const toolCallId = typeof payload.toolCallId === 'string' ? payload.toolCallId : null;
		const dedupeKey = toolCallId ?? `${artifactId}::${instruction}`;
		if (this.#docEditKeys.has(dedupeKey)) return;
		this.#docEditKeys.add(dedupeKey);
		this.#onRequestDocumentEdit?.({ artifactId, instruction });
	}

	// ── send + queue-while-busy (DUR-6, chat) ──────────────────────────────────────────────────────

	/** Commit this turn's tier → the subscription re-subscribes to the same agent channel. */
	#commitAgentKind(kind: AgentKind): void {
		if (this.committedAgentKind === kind) return;
		this.#sentKind = kind;
		this.#cycleSubscription();
	}

	async send(text: string, opts: SendOptions = {}): Promise<void> {
		const resourceId = this.#getResourceId();
		if (!text.trim() || !resourceId) return;
		const agentKind: AgentKind = opts.agentKind ?? 'lite';
		if (this.status !== 'ready') {
			// DUR-6: an active run → queue, not silently drop.
			this.#queued = [
				...this.#queued,
				{
					id: `q${(queuedSeq += 1)}`,
					text,
					display: opts.richText ?? text,
					clientContext: opts.clientContext,
					attachmentIds: opts.attachmentIds,
					agentKind
				}
			];
			return;
		}
		this.#commitAgentKind(agentKind);
		this.#lastSend = {
			text,
			clientContext: opts.clientContext,
			richText: opts.richText,
			attachmentIds: opts.attachmentIds,
			agentKind
		};
		const turnSeed = `${this.#threadId}:${this.#now()}`;
		const display = opts.richText ?? text;
		this.#apply((s) => startAssistantTurn(s, display, turnSeed, opts.attachmentIds));
		try {
			const agent = this.#getClient().getAgent(agentIdFor(agentKind));
			await agent.sendMessage({
				message: display,
				resourceId,
				threadId: this.#threadId,
				// Ephemeral per-call context (slash/@mention expansion) — NOT persisted to memory.
				...(opts.clientContext && opts.clientContext.length > 0
					? {
							ifIdle: {
								streamOptions: {
									context: opts.clientContext.map((cc) => ({ role: 'user' as const, content: cc }))
								}
							}
						}
					: {})
			});
		} catch (err) {
			this.#apply((s) => ({
				...settleAssistantTurn(s),
				error: readableApiErrorMessage(err, 'Gagal mengirim pesan.')
			}));
		}
	}

	/** Dispatch the head of the client queue when the thread returns to ready (re-entrancy guarded). */
	#maybeDispatchQueue(): void {
		if (this.status !== 'ready' || this.#queued.length === 0 || this.#dispatchingQueue) return;
		this.#dispatchingQueue = true;
		const [head, ...rest] = this.#queued;
		this.#queued = rest;
		void this.send(head.text, {
			clientContext: head.clientContext,
			richText: head.display,
			attachmentIds: head.attachmentIds,
			agentKind: head.agentKind
		}).finally(() => {
			this.#dispatchingQueue = false;
			// Chain the next queued item if the send returned to ready synchronously.
			this.#maybeDispatchQueue();
		});
	}

	cancelQueued(id: string): void {
		this.#queued = this.#queued.filter((i) => i.id !== id);
	}

	// ── stop / regenerate (chat) ───────────────────────────────────────────────────────────────────

	/** Stop the active chat turn: server-side cancel (`abort`) → the reducer settles on the `abort`
	 *  chunk (no `AbortError`). Client queue is cleared (the user stopped the pipeline). */
	async stop(): Promise<void> {
		this.#queued = [];
		try {
			await this.#sub?.abort();
		} catch {
			/* best-effort */
		}
		this.#apply((s) => settleAssistantTurn(s));
	}

	/**
	 * Regenerate the last answer: delete the last [user, assistant] pair from server memory
	 * (positional, signal-aware) then re-send the same question with the original context/tier (FE-8).
	 * Chat path only; a `/deep` regenerate lands in Phase 7 (THX-5).
	 */
	async regenerate(): Promise<void> {
		const resourceId = this.#getResourceId();
		if (!resourceId || this.status !== 'ready') return;
		const text = lastUserText(this.#timeline.messages);
		if (!text) return;
		const last = this.#lastSend;
		const lastMatches = last !== null && (last.richText ?? last.text) === text;
		this.#apply((s) => startRegenerate(s));
		try {
			const agent = this.#getClient().getAgent(agentIdFor(this.committedAgentKind));
			await this.#deleteLastServerTurn();
			await agent.sendMessage({
				message: lastMatches ? (last!.richText ?? last!.text) : text,
				resourceId,
				threadId: this.#threadId,
				...(lastMatches && last!.clientContext && last!.clientContext.length > 0
					? {
							ifIdle: {
								streamOptions: {
									context: last!.clientContext.map((cc) => ({ role: 'user' as const, content: cc }))
								}
							}
						}
					: {})
			});
		} catch (err) {
			this.#apply((s) => ({
				...settleAssistantTurn(s),
				error: readableApiErrorMessage(err, 'Gagal membuat ulang jawaban.')
			}));
		}
	}

	async #deleteLastServerTurn(): Promise<void> {
		const thread = (
			this.#getClient() as unknown as {
				getMemoryThread: (o: { threadId: string; agentId: string }) => {
					listMessages: () => Promise<{ messages?: ServerMessageLike[] }>;
					deleteMessages: (ids: string[]) => Promise<unknown>;
				};
			}
		).getMemoryThread({ threadId: this.#threadId, agentId: agentIdFor(this.committedAgentKind) });
		const res = await thread.listMessages();
		const staleIds = lastTurnMessageIds(res.messages ?? []);
		if (staleIds.length > 0) await thread.deleteMessages(staleIds);
	}

	/** Drop the last turn locally (used by a `/deep` regenerate path in Phase 7). */
	dropLastTurn(): void {
		this.#apply((s) => dropLastTurn(s));
	}

	// ── HITL: tool approval (requireApproval) + ask-questions resume (tool path) ────────────────────

	async approve(toolCallId: string): Promise<void> {
		await this.#respond(toolCallId, true);
	}
	async decline(toolCallId: string): Promise<void> {
		await this.#respond(toolCallId, false);
	}

	async #respond(toolCallId: string, approved: boolean): Promise<void> {
		const resourceId = this.#getResourceId();
		if (!resourceId) return;
		this.#apply((s) => ({
			...s,
			approvals: s.approvals.filter((a) => a.toolCallId !== toolCallId)
		}));
		try {
			const agent = this.#getClient().getAgent(agentIdFor(this.committedAgentKind));
			await agent.sendToolApproval({ resourceId, threadId: this.#threadId, toolCallId, approved });
		} catch (err) {
			this.#apply((s) => ({
				...s,
				error: readableApiErrorMessage(err, 'Gagal memproses persetujuan.')
			}));
		}
	}

	/**
	 * Resolve the ask-questions gate (chat tool-suspend path). The continuation streams back through
	 * the subscription. The workflow (`/deep clarify`) resume path is Phase 7 (THX-5); this handles the
	 * `source:"tool"` gate that reaches the chat spine via `reduceMastraChunk`.
	 */
	async resolveAsk(resume: AskQuestionsResumeData): Promise<void> {
		const gate = this.#timeline.askGate;
		if (!gate) return;
		this.#apply((s) => ({ ...s, askGate: undefined, status: 'streaming' }));
		const resourceId = this.#getResourceId();
		if (gate.source !== 'tool' || !resourceId || !gate.toolCallId) {
			this.#apply((s) => ({
				...settleAssistantTurn(s),
				error:
					'Gagal mengirim jawaban klarifikasi (sesi tidak lengkap). Coba mulai ulang pertanyaanmu.'
			}));
			return;
		}
		try {
			const agent = this.#getClient().getAgent(agentIdFor(this.committedAgentKind));
			await agent.sendToolApproval({
				resourceId,
				threadId: this.#threadId,
				toolCallId: gate.toolCallId,
				approved: true,
				resumeData: resume
			});
		} catch (err) {
			this.#apply((s) => ({
				...settleAssistantTurn(s),
				error: readableApiErrorMessage(err, 'Gagal mengirim jawaban.')
			}));
		}
	}

	/** `Date.now()` behind a method so tests can hold it deterministic if needed. */
	#now(): number {
		return Date.now();
	}
}

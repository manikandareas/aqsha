import type { MastraClient } from '@mastra/client-js';
import type { QueryClient } from '@tanstack/svelte-query';
import {
	type AgentKind,
	type AskQuestionsResumeData,
	normalizeAskQuestions
} from '@aqsha/chat-core';
import { readableApiErrorMessage } from '$lib/errors';
import { queryKeys } from '$lib/query';
import { agentIdFor } from '../lib/mastra-client';
import { createChunkReplayFilter } from '../lib/chunk-replay';
import {
	type DeepFailure,
	type DeepNotice,
	type DeepRun,
	type DeepRunSnapshot,
	type WorkflowStepsSnapshot,
	activeHeavyDeepStep,
	clearDeepRunId,
	DANGLING_TURN_ERROR,
	DEEP_HEAVY_STALL_MS,
	DEEP_HEAVY_STEP_MESSAGE,
	DEEP_STALL_MESSAGE,
	DEEP_STALL_MS,
	DEEP_WORKFLOW_ID,
	deepFailureFromSteps,
	deepNoticeFromResult,
	discoverDeepRunId,
	getDeepRunId,
	iterateStream,
	setDeepRunId
} from '../lib/deep-workflow';
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
	reduceWorkflowChunk,
	seedWorkflowProgress,
	settleAssistantTurn,
	settleWorkflowTurn,
	startAssistantTurn,
	startRegenerate,
	reviveWorkflowTurn
} from '../lib/mastra-timeline';
import type { TimelineMessage } from '../lib/timeline-types';

// ── Durable-thread chat + `/deep` Workflow agent (Svelte 5 runes state class) ─────────────────────
//
// Owns the chat spine (subscription / replay / reconnect / send / queue / stop / regenerate / HITL
// tool approval) plus imperative `/deep` durable Workflow orchestration: sendDeep / consumeWorkflow /
// runById re-attach poll / plan+clarify resume / terminal reconciliation / failure-recovery (retry
// via timeTravelStream) / stall detection / server-queue durability. Workflow reducers
// (`reduceWorkflowChunk`, `seedWorkflowProgress`, `settleWorkflowTurn`, `reviveWorkflowTurn`) are
// pure; this class drives them. Subscription + re-attach poll lifecycles are owned imperatively
// (`start()`/`destroy()` from the consuming `$effect`), NOT per-field reflexes.

/** Subscription handle from `agent.subscribeToThread` (subset used here). */
type ThreadSubscription = {
	processDataStream: (o: {
		onChunk: (c: unknown) => void;
		reconnect?: boolean | { maxRetries?: number; delayMs?: number };
	}) => Promise<void>;
	abort: () => Promise<boolean>;
	unsubscribe: () => void;
};

/** Workflow client (subset of `getWorkflow(id)` used). */
type WorkflowClient = {
	createRun: (p: { runId?: string; resourceId: string }) => Promise<DeepRun>;
	runById: (runId: string) => Promise<DeepRunSnapshot>;
};

/** A message held while a run is active, re-sent when the thread returns to `ready` (DUR-6). */
type QueuedSend = {
	id: string;
	mode: 'chat' | 'deep';
	text: string;
	display: string;
	clientContext?: string[];
	richText?: string;
	attachmentIds?: string[];
	agentKind: AgentKind;
	/** Present ⇒ SERVER queue (`queueMessage`, plain chat) — runs even if the tab closes, not cancellable. */
	serverRunId?: string;
};

/** Context of the last-sent turn, for regenerate (FE-8). */
type LastSentTurn = {
	mode: 'chat' | 'deep';
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
	getClient: () => MastraClient;
	threadId: string;
	getResourceId: () => string | null | undefined;
	queryClient: QueryClient;
	initialAgentKind?: AgentKind;
	seed?: TimelineMessage[];
	/**
	 * Astra's `request_document_edit` tool result routes here. Intentionally UNWIRED pending the
	 * editor redesign: with document editing read-only there is no editor to apply the instruction,
	 * so leaving this undefined makes the detector a safe no-op instead of a dead affordance.
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
 * `sendMessage` stores user input as a SIGNAL (`role:"signal"`), so matching by `role==="user"` would
 * MISS it → a duplicate user bubble after refresh (G6). Match positionally: the last assistant + all
 * non-assistant messages just before it, regardless of label.
 */
export function lastTurnMessageIds(messages: readonly ServerMessageLike[]): string[] {
	let lastAssistant = -1;
	for (let i = messages.length - 1; i >= 0; i -= 1) {
		if (messages[i]!.role === 'assistant') {
			lastAssistant = i;
			break;
		}
	}
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

/** A cancellable token for a re-attach poll loop. */
type PollToken = { cancelled: boolean };

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
	#deepStalled = $state<string | null>(null);
	#deepFailed = $state<DeepFailure | null>(null);
	#deepNotice = $state<DeepNotice | null>(null);

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
	#deepRun: DeepRun | null = null;
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive server-run registry
	#queuedServerRuns = new Map<string, { display: string; attachmentIds?: string[] }>();
	#pollToken: PollToken | null = null;

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
	get deepStalled(): string | null {
		return this.#deepStalled;
	}
	get deepFailed(): DeepFailure | null {
		return this.#deepFailed;
	}
	get deepNotice(): DeepNotice | null {
		return this.#deepNotice;
	}

	// ── lifecycle ────────────────────────────────────────────────────────────────────────────────

	/** Begin the subscription + the initial `/deep` re-attach poll. Idempotent; call once from `$effect`. */
	start(): void {
		if (this.#started) return;
		this.#started = true;
		void this.#subscribeLoop();
		this.#scheduleReattach();
	}

	/** Tear down the subscription + poll (call from the `$effect` cleanup / on unmount). */
	destroy(): void {
		this.#cancelled = true;
		this.#subEpoch += 1;
		if (this.#pollToken) this.#pollToken.cancelled = true;
		this.#pollToken = null;
		this.#sub?.unsubscribe();
		this.#sub = null;
	}

	// ── subscription lifecycle (E1) ────────────────────────────────────────────────────────────────

	async #subscribeLoop(): Promise<void> {
		let failures = 0;
		while (!this.#cancelled) {
			const resourceId = this.#getResourceId();
			if (!resourceId) {
				await delay(300);
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
					continue;
				}
				this.#sub = sub;
				failures = 0;
				this.#clearDegraded();
				await sub.processDataStream({
					onChunk: this.#onChunk,
					reconnect: { maxRetries: 20, delayMs: 1000 }
				});
				if (this.#cancelled) return;
				if (myEpoch !== this.#subEpoch) continue;
				await delay(1000);
			} catch (err) {
				if (this.#cancelled) return;
				this.#noteFailure((failures += 1), err);
				await delay(1000);
			}
		}
	}

	#cycleSubscription(): void {
		this.#subEpoch += 1;
		this.#sub?.unsubscribe();
		this.#sub = null;
	}

	#noteFailure(attempt: number, err: unknown): void {
		if (this.#timeline.messages.length === 0) return;
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
		if (!this.#replay(c0)) return; // duplicate replay (FE-2)
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
		this.#flushDeltas();
		// DUR-6: a queued SERVER run (queueMessage) starting → birth its user bubble + placeholder BEFORE
		// the reducer processes `start` (ensureActiveAssistant uses this placeholder).
		if (c0?.type === 'start' && c0.runId) {
			const queuedInfo = this.#queuedServerRuns.get(c0.runId);
			if (queuedInfo) {
				this.#queuedServerRuns.delete(c0.runId);
				this.#queued = this.#queued.filter((i) => i.serverRunId !== c0.runId);
				this.#apply((s) =>
					startAssistantTurn(s, queuedInfo.display, c0.runId!, queuedInfo.attachmentIds)
				);
			}
		}
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

	#apply(fn: (s: MastraTimelineState) => MastraTimelineState): void {
		this.#timeline = fn(this.#timeline);
	}

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

	// ── tier commit ────────────────────────────────────────────────────────────────────────────────
	#commitAgentKind(kind: AgentKind): void {
		if (this.committedAgentKind === kind) return;
		this.#sentKind = kind;
		this.#cycleSubscription();
	}

	commitAgentKind(kind: AgentKind): void {
		this.#commitAgentKind(kind);
	}

	// ── send (chat) + queue-while-busy (DUR-6) ─────────────────────────────────────────────────────

	async send(text: string, opts: SendOptions = {}): Promise<void> {
		const resourceId = this.#getResourceId();
		if (!text.trim() || !resourceId) return;
		const agentKind: AgentKind = opts.agentKind ?? 'lite';
		if (this.status !== 'ready') {
			await this.#enqueueWhileBusy({
				mode: 'chat',
				text,
				display: opts.richText ?? text,
				clientContext: opts.clientContext,
				richText: opts.richText,
				attachmentIds: opts.attachmentIds,
				agentKind
			});
			return;
		}
		this.#commitAgentKind(agentKind);
		this.#lastSend = {
			mode: 'chat',
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

	/**
	 * DUR-6 queue: plain chat over a chat run → SERVER queue (`queueMessage`; runtime auto-starts a new
	 * run when the active one finishes, runs even if the tab closes). Everything else (context/attachment/
	 * different tier, all `/deep`, or while a `/deep` run is active) → CLIENT queue dispatched on ready.
	 */
	async #enqueueWhileBusy(item: Omit<QueuedSend, 'id' | 'serverRunId'>): Promise<void> {
		const id = `q:${this.#now()}:${(queuedSeq += 1)}`;
		const resourceId = this.#getResourceId();
		const deepActive = this.#deepRun !== null || getDeepRunId(this.#threadId) !== null;
		const activeChatRunId = deepActive ? null : (this.#timeline.activeRunId ?? null);
		const canServerQueue =
			item.mode === 'chat' &&
			activeChatRunId !== null &&
			!!resourceId &&
			!(item.clientContext && item.clientContext.length > 0) &&
			!(item.attachmentIds && item.attachmentIds.length > 0) &&
			item.agentKind === this.committedAgentKind;
		if (canServerQueue) {
			try {
				const agent = this.#getClient().getAgent(
					agentIdFor(this.committedAgentKind)
				) as unknown as {
					queueMessage: (p: {
						runId: string;
						message: string;
						resourceId: string;
						threadId: string;
					}) => Promise<{ runId?: string }>;
				};
				const res = await agent.queueMessage({
					runId: activeChatRunId,
					message: item.display,
					resourceId: resourceId!,
					threadId: this.#threadId
				});
				if (typeof res.runId === 'string') {
					this.#queuedServerRuns.set(res.runId, {
						display: item.display,
						attachmentIds: item.attachmentIds
					});
					this.#queued = [...this.#queued, { ...item, id, serverRunId: res.runId }];
					return;
				}
			} catch {
				/* queueMessage failed → fall back to the client queue (still sent, just needs a live tab) */
			}
		}
		this.#queued = [...this.#queued, { ...item, id }];
	}

	/** Dispatch the first CLIENT-queued item when the thread returns to ready (re-entrancy guarded). */
	#maybeDispatchQueue(): void {
		if (this.status !== 'ready' || this.#dispatchingQueue) return;
		const next = this.#queued.find((i) => i.serverRunId === undefined);
		if (!next) return;
		this.#dispatchingQueue = true;
		this.#queued = this.#queued.filter((i) => i.id !== next.id);
		const opts: SendOptions = {
			clientContext: next.clientContext,
			richText: next.richText,
			attachmentIds: next.attachmentIds,
			agentKind: next.agentKind
		};
		const run = next.mode === 'deep' ? this.sendDeep(next.text, opts) : this.send(next.text, opts);
		void run.finally(() => {
			this.#dispatchingQueue = false;
			this.#maybeDispatchQueue();
		});
	}

	cancelQueued(id: string): void {
		// Server-queued items can't be cancelled (no unqueue API) → only client items.
		this.#queued = this.#queued.filter((i) => i.id !== id || i.serverRunId !== undefined);
	}

	// ── stop / regenerate ──────────────────────────────────────────────────────────────────────────

	/**
	 * Stop the active turn. Chat → server abort → the reducer settles on the `abort` chunk. `/deep` →
	 * cancel the Workflow run server-side (FE-4); a persisted-but-detached run (post-refresh RUNNING) is
	 * cancelled lazily. The B1 failure card is intentionally left alone. Client queue is cleared.
	 */
	stop(): void {
		this.#queued = this.#queued.filter((i) => i.serverRunId !== undefined);
		this.#deepStalled = null;
		const run = this.#deepRun;
		const settleDeepStop = () => {
			clearDeepRunId(this.#threadId);
			this.#deepRun = null;
			this.#apply((s) => settleAssistantTurn({ ...s, planGate: undefined, askGate: undefined }));
		};
		if (run) {
			void run.cancel().catch(() => {});
			settleDeepStop();
			return;
		}
		const resourceId = this.#getResourceId();
		const deepRunId = getDeepRunId(this.#threadId);
		if (deepRunId && deepRunId !== this.#deepFailed?.runId) {
			if (resourceId) {
				void this.#workflow()
					.createRun({ runId: deepRunId, resourceId })
					.then((r) => r.cancel())
					.catch(() => {});
				settleDeepStop();
				return;
			}
			// Post-refresh window before Clerk resolves resourceId → no-op; a later click cancels for real.
			return;
		}
		void this.#sub?.abort().catch(() => {});
		this.#apply((s) => settleAssistantTurn(s));
	}

	/**
	 * Regenerate (G6): re-run the last user message without a duplicate. A `/deep` turn regenerates AS
	 * `/deep` (not downgraded to chat, which would orphan its report + sources). Deletes the last
	 * [user, assistant] pair from server memory first, then re-sends with the original context/tier (FE-8).
	 */
	async regenerate(): Promise<void> {
		const resourceId = this.#getResourceId();
		if (!resourceId || this.status !== 'ready') return;
		const text = lastUserText(this.#timeline.messages);
		if (!text) return;
		if (this.#deepFailed) this.dismissDeepFailure();
		const last = this.#lastSend;
		const lastMatches = last !== null && (last.richText ?? last.text) === text;

		if (lastMatches && last!.mode === 'deep') {
			try {
				await this.#deleteLastServerTurn();
			} catch (err) {
				this.#apply((s) => ({
					...s,
					error: readableApiErrorMessage(err, 'Gagal membuat ulang jawaban.')
				}));
				return;
			}
			this.#apply((s) => dropLastTurn(s));
			await this.sendDeep(last!.text, {
				clientContext: last!.clientContext,
				richText: last!.richText,
				attachmentIds: last!.attachmentIds,
				agentKind: last!.agentKind
			});
			return;
		}

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

	/** Drop the last turn locally. */
	dropLastTurn(): void {
		this.#apply((s) => dropLastTurn(s));
	}

	// ── HITL: tool approval (requireApproval) + ask-questions resume (tool + workflow) ──────────────

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

	async resolveAsk(resume: AskQuestionsResumeData): Promise<void> {
		const gate = this.#timeline.askGate;
		if (!gate) return;
		this.#apply((s) => ({ ...s, askGate: undefined, status: 'streaming' }));
		if (gate.source === 'workflow') {
			// `/deep` step `clarify` → resume the Workflow (parallel to resolvePlan).
			const run = this.#deepRun;
			if (!run) {
				this.#apply((s) => ({ ...settleAssistantTurn(s), askGate: undefined }));
				return;
			}
			try {
				const stream = await run.resumeStream({
					step: 'clarify',
					resumeData: resume as Record<string, unknown>
				});
				await this.#consumeWorkflow(stream);
				this.#maybeReattachAfterStreamClose(run.runId);
			} catch (err) {
				if (await this.#clearDeepRunIdUnlessAlive(run.runId)) {
					this.#bumpReattach();
					return;
				}
				this.#apply((s) => ({
					...settleAssistantTurn(s),
					error: readableApiErrorMessage(err, 'Gagal melanjutkan riset mendalam.')
				}));
			}
			return;
		}
		// source === "tool" (chat): resume the tool-suspend via `sendToolApproval` carrying `resumeData`.
		const resourceId = this.#getResourceId();
		if (!resourceId || !gate.toolCallId) {
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

	// ── `/deep` Workflow orchestration ─────────────────────────────────────────────────────────────

	#workflow(): WorkflowClient {
		return this.#getClient().getWorkflow(DEEP_WORKFLOW_ID) as unknown as WorkflowClient;
	}

	async #fetchDeepRun(runId: string): Promise<DeepRunSnapshot | null> {
		try {
			return await this.#workflow().runById(runId);
		} catch {
			return null;
		}
	}

	async #deepRunStatus(runId: string): Promise<string> {
		return (await this.#fetchDeepRun(runId))?.status ?? '';
	}

	#clearDeepRunAndRefresh(): void {
		clearDeepRunId(this.#threadId);
		void this.#qc.invalidateQueries({ queryKey: queryKeys.threads.sources(this.#threadId) });
		void this.#qc.invalidateQueries({ queryKey: queryKeys.threads.all });
	}

	/** B1: single terminal handler (live path + poll re-attach) so semantics can't drift. */
	#applyDeepTerminal(
		runId: string,
		status: string,
		steps: WorkflowStepsSnapshot,
		result?: unknown
	): void {
		const currentKey = getDeepRunId(this.#threadId);
		const ownsKey = currentKey === null || currentKey === runId;
		this.#deepStalled = null;
		if (this.#deepRun === null || this.#deepRun.runId === runId) this.#deepRun = null;
		this.#apply((s) => settleWorkflowTurn(seedWorkflowProgress(s, runId, steps), runId));
		if (status === 'failed') {
			this.#deepFailed = deepFailureFromSteps(runId, steps);
			if (ownsKey) setDeepRunId(this.#threadId, runId); // re-assert the recovery key (survives refresh)
			return;
		}
		this.#deepFailed = null;
		if (status === 'success') this.#deepNotice = deepNoticeFromResult(runId, result);
		if (ownsKey) {
			this.#clearDeepRunAndRefresh();
		} else {
			void this.#qc.invalidateQueries({ queryKey: queryKeys.threads.sources(this.#threadId) });
			void this.#qc.invalidateQueries({ queryKey: queryKeys.threads.all });
		}
	}

	async #reconcileDeepTerminal(runId: string | undefined): Promise<void> {
		if (!runId) {
			this.#deepRun = null;
			this.#clearDeepRunAndRefresh();
			return;
		}
		const st = await this.#fetchDeepRun(runId);
		if (!st) {
			this.#deepRun = null;
			this.#bumpReattach();
			return;
		}
		this.#applyDeepTerminal(runId, st.status ?? '', st.steps ?? {}, st.result);
	}

	async #consumeWorkflow(stream: ReadableStream<MastraChunk>): Promise<void> {
		let suspended = false;
		let terminalHandled = false;
		for await (const chunk of iterateStream(stream)) {
			this.#apply((s) => reduceWorkflowChunk(s, chunk));
			const stepId = (chunk.payload as { id?: unknown } | undefined)?.id;
			if (
				chunk.type === 'workflow-step-suspended' &&
				(stepId === 'approve-plan' || stepId === 'clarify')
			) {
				suspended = true;
			}
			if (
				chunk.type === 'workflow-step-result' &&
				(stepId === 'search-literature' || stepId === 'assign-citations')
			) {
				void this.#qc.invalidateQueries({ queryKey: queryKeys.threads.sources(this.#threadId) });
			}
			if (
				!suspended &&
				!terminalHandled &&
				(chunk.type === 'workflow-finish' || chunk.type === 'workflow-canceled')
			) {
				terminalHandled = true;
				await this.#reconcileDeepTerminal(chunk.runId ?? this.#deepRun?.runId);
			}
		}
	}

	/** Keep the runId if the run is still alive server-side (→ poll re-attach recovers it). */
	async #clearDeepRunIdUnlessAlive(runId: string | undefined): Promise<boolean> {
		if (!runId) return false;
		const status = await this.#deepRunStatus(runId);
		if (status === 'running' || status === 'suspended' || status === 'waiting') return true;
		this.#deepRun = null;
		if (status === '') this.#bumpReattach();
		if (status === '' || status === 'failed') return false; // failed key = B1 recovery, keep it
		clearDeepRunId(this.#threadId);
		return false;
	}

	#maybeReattachAfterStreamClose(runId: string): void {
		if (this.#deepRun?.runId !== runId) return; // normal terminal → runId already cleared
		if (this.#timeline.planGate || this.#timeline.askGate) return; // normal suspend-close (HITL)
		this.#bumpReattach();
	}

	async sendDeep(question: string, opts: SendOptions = {}): Promise<void> {
		const resourceId = this.#getResourceId();
		if (!resourceId || !question.trim()) return;
		const agentKind: AgentKind = opts.agentKind ?? 'lite';
		if (this.status !== 'ready') {
			// `/deep` is always CLIENT queue — the Workflow isn't over the thread-stream runtime.
			await this.#enqueueWhileBusy({
				mode: 'deep',
				text: question,
				display: opts.richText ?? question,
				clientContext: opts.clientContext,
				richText: opts.richText,
				attachmentIds: opts.attachmentIds,
				agentKind
			});
			return;
		}
		this.#commitAgentKind(agentKind);
		this.#lastSend = {
			mode: 'deep',
			text: question,
			clientContext: opts.clientContext,
			richText: opts.richText,
			attachmentIds: opts.attachmentIds,
			agentKind
		};
		const turnSeed = `${this.#threadId}:${this.#now()}`;
		const display = opts.richText ?? question;
		this.#apply((s) => startAssistantTurn(s, display, turnSeed, opts.attachmentIds));
		try {
			const run = await this.#workflow().createRun({ resourceId });
			this.#deepRun = run;
			this.#deepFailed = null;
			this.#deepNotice = null;
			setDeepRunId(this.#threadId, run.runId);
			const inputData: Record<string, unknown> = {
				question,
				threadId: this.#threadId,
				agentKind
			};
			if (opts.richText && opts.richText !== question) inputData.displayQuestion = opts.richText;
			if (opts.clientContext && opts.clientContext.length > 0)
				inputData.context = opts.clientContext.join('\n\n');
			const stream = await run.stream({ inputData, closeOnSuspend: true });
			await this.#consumeWorkflow(stream);
			this.#maybeReattachAfterStreamClose(run.runId);
		} catch (err) {
			if (await this.#clearDeepRunIdUnlessAlive(this.#deepRun?.runId)) {
				this.#bumpReattach();
				return;
			}
			this.#apply((s) => ({
				...settleAssistantTurn(s),
				error: readableApiErrorMessage(err, 'Gagal memulai riset mendalam.')
			}));
		}
	}

	async resolvePlan(approved: boolean, edits?: string): Promise<void> {
		const run = this.#deepRun;
		if (!run) {
			this.#apply((s) => ({ ...settleAssistantTurn(s), planGate: undefined }));
			return;
		}
		this.#apply((s) => ({ ...s, planGate: undefined, status: approved ? 'streaming' : 'ready' }));
		try {
			const stream = await run.resumeStream({
				step: 'approve-plan',
				resumeData: { approved, ...(edits ? { edits } : {}) }
			});
			await this.#consumeWorkflow(stream);
			this.#maybeReattachAfterStreamClose(run.runId);
		} catch (err) {
			if (await this.#clearDeepRunIdUnlessAlive(run.runId)) {
				this.#bumpReattach();
				return;
			}
			this.#apply((s) => ({
				...settleAssistantTurn(s),
				error: readableApiErrorMessage(err, 'Gagal melanjutkan riset mendalam.')
			}));
		}
	}

	dismissDeepFailure(): void {
		this.#deepFailed = null;
		clearDeepRunId(this.#threadId);
		this.#deepRun = null;
	}

	dismissDeepNotice(): void {
		this.#deepNotice = null;
	}

	/** DUR-5: restart a stalled run from its last active step (`.restart`), snapshot-based. */
	async restartDeep(): Promise<void> {
		const resourceId = this.#getResourceId();
		if (!resourceId) return;
		const runId = this.#deepRun?.runId ?? getDeepRunId(this.#threadId);
		if (!runId) return;
		this.#deepStalled = null;
		try {
			const run = await this.#workflow().createRun({ runId, resourceId });
			this.#deepRun = run;
			await run.restart({});
			this.#bumpReattach();
		} catch (err) {
			if ((await this.#deepRunStatus(runId)) === 'pending') {
				this.#apply((s) => ({
					...s,
					error: 'Run riset ini belum pernah mulai. Hentikan, lalu kirim ulang pertanyaannya.'
				}));
				return;
			}
			this.#apply((s) => ({
				...s,
				error: readableApiErrorMessage(err, 'Gagal memulai ulang riset mendalam.')
			}));
		}
	}

	/** B1: retry a failed run FROM the failed step via time-travel (`.timeTravelStream`) — no new debit. */
	async retryDeep(): Promise<void> {
		const failure = this.#deepFailed;
		const resourceId = this.#getResourceId();
		if (!resourceId || !failure) return;
		if (this.status !== 'ready') return;
		const stepId = failure.stepId;
		if (!stepId) {
			this.dismissDeepFailure();
			this.#apply((s) => ({
				...s,
				error: 'Tidak bisa menentukan langkah yang gagal. Coba buat ulang jawabannya.'
			}));
			return;
		}
		this.#deepFailed = null;
		try {
			const run = await this.#workflow().createRun({ runId: failure.runId, resourceId });
			this.#deepRun = run;
			setDeepRunId(this.#threadId, failure.runId);
			this.#apply((s) => reviveWorkflowTurn(s, failure.runId));
			const stream = await run.timeTravelStream({ step: stepId });
			await this.#consumeWorkflow(stream);
			this.#maybeReattachAfterStreamClose(failure.runId);
		} catch (err) {
			const snap = await this.#fetchDeepRun(failure.runId);
			const status = snap?.status ?? '';
			if (status === 'running' || status === 'suspended' || status === 'waiting') {
				this.#bumpReattach();
				return;
			}
			if (status === 'success' || status === 'canceled') {
				this.#applyDeepTerminal(failure.runId, status, snap?.steps ?? {}, snap?.result);
				return;
			}
			this.#deepFailed = failure;
			this.#apply((s) => ({
				...settleWorkflowTurn(s, failure.runId),
				error: readableApiErrorMessage(err, 'Gagal mengulang riset mendalam.')
			}));
		}
	}

	// ── `/deep` re-attach poll (runById, step-level) ────────────────────────────────────────────────

	/** FE-5: re-run the re-attach poll without waiting for a manual refresh (stream broke, run alive). */
	#bumpReattach(): void {
		this.#scheduleReattach();
	}

	#scheduleReattach(): void {
		if (this.#pollToken) this.#pollToken.cancelled = true;
		const token: PollToken = { cancelled: false };
		this.#pollToken = token;
		void this.#reattachPoll(token);
	}

	async #reattachPoll(token: PollToken): Promise<void> {
		const resourceId = this.#getResourceId();
		if (!resourceId) return;
		let runId = getDeepRunId(this.#threadId);
		if (!runId) {
			const msgs = this.#timeline.messages;
			const last = msgs[msgs.length - 1];
			if (!last || last.role !== 'user') return;
			runId = await discoverDeepRunId(this.#getClient(), this.#threadId, resourceId);
			if (token.cancelled) return;
			if (!runId) {
				setTimeout(() => {
					if (token.cancelled) return;
					const m = this.#timeline.messages;
					const l = m[m.length - 1];
					if (this.status !== 'ready' || !l || l.role !== 'user') return;
					this.#apply((s) =>
						s.status === 'ready' && !s.error ? { ...s, error: DANGLING_TURN_ERROR } : s
					);
				}, 5000);
				return;
			}
			setDeepRunId(this.#threadId, runId);
		}
		// Immediate "working" indicator if the turn genuinely dangles.
		this.#apply((s) => {
			if (s.status !== 'ready') return s;
			const l = s.messages[s.messages.length - 1];
			return l && l.role === 'user' ? { ...s, status: 'submitted' } : s;
		});
		const rid = runId;
		const wf = this.#workflow();
		let errors = 0;
		let sourcesSeeded = false;
		let sourcesRefreshed = false;
		let progressSig = '';
		let progressAt = Date.now();
		while (!token.cancelled) {
			const wfState = await this.#fetchDeepRun(rid);
			if (token.cancelled) return;
			if (!wfState) {
				errors += 1;
				if (errors >= 8) {
					this.#apply((s) => settleAssistantTurn(s));
					return;
				}
				await delay(2500);
				continue;
			}
			errors = 0;
			const status = wfState.status;
			const steps = wfState.steps ?? {};
			if (status === 'suspended') {
				this.#deepStalled = null;
				if (this.#deepRun === null) {
					this.#deepRun = await wf.createRun({ runId: rid, resourceId });
				}
				const clarifyStep = steps['clarify'];
				if (clarifyStep?.status === 'suspended' && clarifyStep.suspendPayload) {
					const questions = normalizeAskQuestions(clarifyStep.suspendPayload.questions);
					if (questions.length === 0) {
						this.#apply((s) => settleWorkflowTurn(seedWorkflowProgress(s, rid, steps), rid));
						return;
					}
					const findings = clarifyStep.suspendPayload.findings;
					this.#apply((s) => ({
						...seedWorkflowProgress(s, rid, steps),
						askGate: {
							source: 'workflow',
							questions,
							...(typeof findings === 'string' && findings ? { findings } : {}),
							runId: rid
						}
					}));
					return;
				}
				const sp = steps['approve-plan']?.suspendPayload ?? {};
				const subQuestions = Array.isArray(sp.subQuestions)
					? sp.subQuestions.filter((x): x is string => typeof x === 'string')
					: [];
				this.#apply((s) => ({
					...seedWorkflowProgress(s, rid, steps),
					planGate: { plan: typeof sp.plan === 'string' ? sp.plan : '', subQuestions }
				}));
				return;
			}
			if (status === 'success' || status === 'failed' || status === 'canceled') {
				this.#applyDeepTerminal(rid, status, steps, wfState.result);
				return;
			}
			// Stop during RUNNING cleared/changed the key → settle & exit; don't re-seed progress.
			if (getDeepRunId(this.#threadId) !== rid) {
				this.#deepStalled = null;
				this.#apply((s) => settleWorkflowTurn(s, rid));
				return;
			}
			this.#apply((s) => seedWorkflowProgress(s, rid, steps));
			const sig = `${status}|${Object.entries(steps)
				.map(([id, st]) => `${id}:${String(st?.status ?? '')}`)
				.sort()
				.join(',')}`;
			if (sig !== progressSig) {
				progressSig = sig;
				progressAt = Date.now();
				this.#deepStalled = null;
			} else if (status === 'running' || status === 'waiting' || status === 'pending') {
				const heavyStep = activeHeavyDeepStep(steps);
				if (Date.now() - progressAt >= (heavyStep ? DEEP_HEAVY_STALL_MS : DEEP_STALL_MS)) {
					this.#deepStalled =
						(heavyStep && DEEP_HEAVY_STEP_MESSAGE[heavyStep]) || DEEP_STALL_MESSAGE;
				}
			}
			if (!sourcesSeeded && steps['search-literature']) {
				sourcesSeeded = true;
				void this.#qc.invalidateQueries({ queryKey: queryKeys.threads.sources(this.#threadId) });
			}
			if (!sourcesRefreshed && steps['search-literature']?.status === 'success') {
				sourcesRefreshed = true;
				void this.#qc.invalidateQueries({ queryKey: queryKeys.threads.sources(this.#threadId) });
			}
			await delay(2500);
		}
	}

	/** `Date.now()` behind a method so tests can hold it deterministic if needed. */
	#now(): number {
		return Date.now();
	}
}

import type { MastraClient } from '@mastra/client-js';
import type { QueryClient } from '@tanstack/svelte-query';
import { type AgentKind, type AskQuestionsResumeData } from '@aqsha/chat-core';
import { readableApiErrorMessage } from '$lib/errors';
import { queryKeys } from '$lib/query';
import { createChunkReplayFilter } from '../lib/chunk-replay';
import {
	type DeepFailure,
	type DeepNotice,
	type DeepRun,
	type DeepRunSnapshot,
	type WorkflowStepsSnapshot,
	clearDeepRunId,
	DEEP_WORKFLOW_ID,
	deepFailureFromSteps,
	deepNoticeFromResult,
	getDeepRunId,
	iterateStream,
	setDeepRunId
} from '../lib/deep-workflow';
import {
	MastraThreadClient,
	type MemoryMessage,
	type WorkflowClient
} from '../lib/mastra-thread-client';
import { ThreadSubscriptionLoop } from '../lib/thread-subscription-loop';
import { HitlBridge } from '../lib/hitl-bridge';
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
import { prependUniqueById } from '../lib/thread-history';
import { ChatSendQueue, type QueuedSend, type QueuedSendInput } from './chat-send-queue.svelte';
import { DeepRunController } from './deep-run-controller.svelte';

// ── Durable-thread chat + `/deep` Workflow agent (Svelte 5 runes state class) ─────────────────────
//
// Owns the chat spine (subscription / replay / reconnect / send / queue / stop / regenerate / HITL
// tool approval) plus imperative `/deep` durable Workflow orchestration: sendDeep / consumeWorkflow /
// runById re-attach poll / plan+clarify resume / terminal reconciliation / failure-recovery (retry
// via timeTravelStream) / stall detection / server-queue durability. Workflow reducers
// (`reduceWorkflowChunk`, `seedWorkflowProgress`, `settleWorkflowTurn`, `reviveWorkflowTurn`) are
// pure; this class drives them. Subscription + re-attach poll lifecycles are owned imperatively
// (`start()`/`destroy()` from the consuming `$effect`), NOT per-field reflexes.

/** Context of the last-sent turn, retained so regenerate preserves its mode and inputs. */
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
	/** Scope proyek — dikirim per request sebagai RequestContext `aqsha-workspace-id`. */
	getWorkspaceId?: () => string | null;
	/**
	 * Astra's `request_document_edit` tool result routes here. Intentionally UNWIRED pending the
	 * editor redesign: with document editing read-only there is no editor to apply the instruction,
	 * so leaving this undefined makes the detector a safe no-op instead of a dead affordance.
	 */
	onRequestDocumentEdit?: (edit: { artifactId: string; instruction: string }) => void;
	/**
	 * Dipanggil setelah Mastra meng-ack turn (`sendMessage` / `createRun` resolve pada JSON
	 * `{ accepted: true }` — bukan akhir stream). Aman untuk bind URL / promote draft.
	 */
	onAccepted?: () => void;
	/** Dipanggil satu kali setiap lifecycle run bertransisi dari aktif kembali ke `ready`. */
	onSettled?: () => void;
};

const SUBSCRIBE_DEGRADED_ERROR =
	'Koneksi ke Astra tidak stabil. Jawaban mungkin tertunda; kami mencoba menyambung ulang.';

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

/**
 * Ids of the last [user, assistant] pair in server memory (to delete on regenerate). Durable-thread
 * `sendMessage` stores user input as a SIGNAL (`role:"signal"`), so matching by `role==="user"` would
 * MISS it and duplicate the user bubble after refresh. Match positionally: the last assistant + all
 * non-assistant messages just before it, regardless of label.
 */
export function lastTurnMessageIds(messages: readonly MemoryMessage[]): string[] {
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

export class ThreadAgent {
	readonly #mastra: MastraThreadClient;
	readonly #threadId: string;
	readonly #getResourceId: () => string | null | undefined;
	readonly #getWorkspaceId: () => string | null;
	readonly #qc: QueryClient;
	readonly #initialAgentKind: AgentKind;
	readonly #onRequestDocumentEdit?: (edit: { artifactId: string; instruction: string }) => void;
	readonly #onAccepted?: () => void;
	readonly #onSettled?: () => void;
	readonly #subscription: ThreadSubscriptionLoop;
	readonly #deepController: DeepRunController;
	readonly #hitl: HitlBridge;

	// Reactive state (reduces per chunk / drives the UI).
	#timeline = $state.raw<MastraTimelineState>(initialMastraTimeline());
	#sentKind = $state<AgentKind | null>(null);
	readonly #queue = new ChatSendQueue();
	#deepStalled = $state<string | null>(null);
	#deepFailed = $state<DeepFailure | null>(null);
	#deepNotice = $state<DeepNotice | null>(null);

	get committedAgentKind(): AgentKind {
		return this.#sentKind ?? this.#initialAgentKind;
	}

	// Non-reactive handles / registries / buffers.
	#replay = createChunkReplayFilter();
	#prevStatus: MastraStatus = 'ready';
	#pendingDeltas: MastraChunk[] = [];
	#deltaFlushScheduled = false;
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive dedup registry (never read reactively)
	#docEditKeys = new Set<string>();
	#lastSend: LastSentTurn | null = null;
	#deepRun: DeepRun | null = null;

	constructor(opts: ThreadAgentOptions) {
		this.#mastra = new MastraThreadClient(opts.getClient);
		this.#threadId = opts.threadId;
		this.#getResourceId = opts.getResourceId;
		this.#getWorkspaceId = opts.getWorkspaceId ?? (() => null);
		this.#qc = opts.queryClient;
		this.#initialAgentKind = opts.initialAgentKind ?? 'lite';
		this.#onRequestDocumentEdit = opts.onRequestDocumentEdit;
		this.#onAccepted = opts.onAccepted;
		this.#onSettled = opts.onSettled;
		this.#timeline = initialMastraTimeline(opts.seed ?? []);
		this.#subscription = new ThreadSubscriptionLoop({
			getResourceId: this.#getResourceId,
			connect: (resourceId) =>
				this.#mastra.agent(this.committedAgentKind).subscribeToThread({
					threadId: this.#threadId,
					resourceId
				}),
			onChunk: this.#onChunk,
			onConnected: () => this.#clearDegraded(),
			onFailure: (attempt, error) => this.#noteFailure(attempt, error)
		});
		this.#deepController = new DeepRunController({
			threadId: this.#threadId,
			getResourceId: this.#getResourceId,
			getClient: () => this.#mastra.raw,
			getMessages: () => this.#timeline.messages,
			getStatus: () => this.#timeline.status,
			getRun: () => this.#deepRun,
			setRun: (run) => (this.#deepRun = run),
			setStalled: (message) => (this.#deepStalled = message),
			workflow: () => this.#workflow(),
			fetchRun: (runId) => this.#fetchDeepRun(runId),
			apply: (update) => this.#apply(update),
			applyTerminal: (runId, status, steps, result) =>
				this.#applyDeepTerminal(runId, status, steps, result),
			queryClient: this.#qc
		});
		this.#hitl = new HitlBridge({
			threadId: this.#threadId,
			getResourceId: this.#getResourceId,
			getAgentKind: () => this.committedAgentKind,
			getAgent: (kind) => this.#mastra.agent(kind),
			apply: (update) => this.#apply(update)
		});
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
		return this.#queue.items;
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

	/** Insert older persisted messages without touching live stream/gate state. */
	prependHistory(messages: readonly TimelineMessage[]): void {
		const next = prependUniqueById(this.#timeline.messages, messages);
		if (!next) return;
		this.#timeline = {
			...this.#timeline,
			messages: next
		};
	}

	// ── lifecycle ────────────────────────────────────────────────────────────────────────────────

	/** Begin the subscription + the initial `/deep` re-attach poll. Idempotent; call once from `$effect`. */
	start(): void {
		this.#subscription.start();
		this.#deepController.schedule();
	}

	/** Tear down the subscription + poll (call from the `$effect` cleanup / on unmount). */
	destroy(): void {
		this.#subscription.destroy();
		this.#deepController.destroy();
	}

	#cycleSubscription(): void {
		this.#subscription.cycle();
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

	// ── chunk router (chat) + high-frequency delta batching ────────────────────────────────────────

	#onChunk = (chunk: unknown): void => {
		const c0 = chunk as MastraChunk;
		if (!this.#replay(c0)) return; // Durable reconnects can replay chunks already reduced locally.
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
		// A queued server run must create its user bubble + placeholder before
		// the reducer processes `start` (ensureActiveAssistant uses this placeholder).
		if (c0?.type === 'start' && c0.runId) {
			const queuedInfo = this.#queue.consumeServerRun(c0.runId);
			if (queuedInfo) {
				this.#apply((s) =>
					startAssistantTurn(s, queuedInfo.display, c0.runId!, queuedInfo.attachmentIds)
				);
			}
		}
		this.#apply((s) => reduceMastraChunk(s, c0));
		this.#detectDocumentEdit(c0);
	};

	#flushDeltas(): void {
		this.#deltaFlushScheduled = false;
		const batch = this.#pendingDeltas;
		if (batch.length === 0) return;
		this.#pendingDeltas = [];
		this.#apply((s) => batch.reduce((acc, c) => reduceMastraChunk(acc, c), s));
	}

	#apply(fn: (s: MastraTimelineState) => MastraTimelineState): void {
		this.#timeline = fn(this.#timeline);
		this.#afterStructural();
	}

	#afterStructural(): void {
		const now = this.#timeline.status;
		if (this.#prevStatus !== 'ready' && now === 'ready') {
			this.#onSettled?.();
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

	// ── send (chat) + queue-while-busy ─────────────────────────────────────────────────────────────

	/** Body RequestContext scope proyek — key non-`aqsha__` = boleh dikirim klien (di-merge server Mastra). */
	#workspaceRequestContext(): { requestContext?: Record<string, string> } {
		const workspaceId = this.#getWorkspaceId();
		return workspaceId ? { requestContext: { 'aqsha-workspace-id': workspaceId } } : {};
	}

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
			const agent = this.#mastra.agent(agentKind);
			await agent.sendMessage({
				message: display,
				resourceId,
				threadId: this.#threadId,
				...this.#workspaceRequestContext(),
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
			this.#onAccepted?.();
		} catch (err) {
			this.#apply((s) => ({
				...settleAssistantTurn(s),
				error: readableApiErrorMessage(err, 'Gagal mengirim pesan.')
			}));
		}
	}

	/**
	 * Plain chat over a chat run uses the server queue (`queueMessage`; runtime auto-starts a new
	 * run when the active one finishes, runs even if the tab closes). Everything else (context/attachment/
	 * different tier, all `/deep`, or while a `/deep` run is active) → CLIENT queue dispatched on ready.
	 */
	async #enqueueWhileBusy(item: QueuedSendInput): Promise<void> {
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
				const agent = this.#mastra.agent(this.committedAgentKind);
				const res = await agent.queueMessage({
					runId: activeChatRunId,
					message: item.display,
					resourceId: resourceId!,
					threadId: this.#threadId,
					...this.#workspaceRequestContext()
				});
				if (typeof res.runId === 'string') {
					this.#queue.addServer(item, res.runId, this.#now());
					return;
				}
			} catch {
				/* queueMessage failed → fall back to the client queue (still sent, just needs a live tab) */
			}
		}
		this.#queue.addClient(item, this.#now());
	}

	/** Dispatch the first CLIENT-queued item when the thread returns to ready (re-entrancy guarded). */
	#maybeDispatchQueue(): void {
		if (this.status !== 'ready') return;
		const next = this.#queue.beginClientDispatch();
		if (!next) return;
		const opts: SendOptions = {
			clientContext: next.clientContext,
			richText: next.richText,
			attachmentIds: next.attachmentIds,
			agentKind: next.agentKind
		};
		const run = next.mode === 'deep' ? this.sendDeep(next.text, opts) : this.send(next.text, opts);
		void run.finally(() => {
			this.#queue.finishClientDispatch();
			this.#maybeDispatchQueue();
		});
	}

	cancelQueued(id: string): void {
		// Server-queued items can't be cancelled (no unqueue API) → only client items.
		this.#queue.cancelClient(id);
	}

	// ── stop / regenerate ──────────────────────────────────────────────────────────────────────────

	/**
	 * Stop the active turn. Chat → server abort → the reducer settles on the `abort` chunk. `/deep` →
	 * cancel the Workflow run server-side; a persisted-but-detached run (post-refresh RUNNING) is
	 * cancelled lazily. A failure card is intentionally left alone. Client queue is cleared.
	 */
	stop(): void {
		this.#queue.dropClientItems();
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
		void this.#subscription.abort()?.catch(() => {});
		this.#apply((s) => settleAssistantTurn(s));
	}

	/**
	 * Re-run the last user message without a duplicate. A `/deep` turn regenerates as
	 * `/deep` (not downgraded to chat, which would orphan its report + sources). Deletes the last
	 * [user, assistant] pair from server memory first, then re-sends with the original context and tier.
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
			const agent = this.#mastra.agent(this.committedAgentKind);
			await this.#deleteLastServerTurn();
			await agent.sendMessage({
				message: lastMatches ? (last!.richText ?? last!.text) : text,
				resourceId,
				threadId: this.#threadId,
				...this.#workspaceRequestContext(),
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
		const thread = this.#mastra.memoryThread(this.#threadId, this.committedAgentKind);
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
		await this.#hitl.respond(toolCallId, true);
	}
	async decline(toolCallId: string): Promise<void> {
		await this.#hitl.respond(toolCallId, false);
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
					this.#deepController.schedule();
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
		await this.#hitl.resolveChatAsk(gate, resume);
	}

	// ── `/deep` Workflow orchestration ─────────────────────────────────────────────────────────────

	#workflow(): WorkflowClient {
		return this.#mastra.workflow(DEEP_WORKFLOW_ID);
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

	/** One terminal handler serves live streams and poll re-attachment so semantics cannot drift. */
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
			this.#deepController.schedule();
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
		if (status === '') this.#deepController.schedule();
		if (status === '' || status === 'failed') return false; // Keep failed keys available for recovery.
		clearDeepRunId(this.#threadId);
		return false;
	}

	#maybeReattachAfterStreamClose(runId: string): void {
		if (this.#deepRun?.runId !== runId) return; // normal terminal → runId already cleared
		if (this.#timeline.planGate || this.#timeline.askGate) return; // normal suspend-close (HITL)
		this.#deepController.schedule();
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
			this.#onAccepted?.();
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
				this.#deepController.schedule();
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
				this.#deepController.schedule();
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

	/** Restart a stalled run from its last active snapshot (`.restart`). */
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
			this.#deepController.schedule();
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

	/** Retry from the failed step via time travel without creating a newly billed run. */
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
				this.#deepController.schedule();
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

	#now(): number {
		return Date.now();
	}
}

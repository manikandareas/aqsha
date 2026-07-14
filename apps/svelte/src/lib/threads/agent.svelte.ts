import type { MastraClient } from '@mastra/client-js';
import { ASTRA_AGENT_ID } from './mastra-client';
import {
	createChunkReplayFilter,
	initialTimeline,
	reduceChunk,
	settleAssistantTurn,
	startAssistantTurn,
	type MastraChunk,
	type Message,
	type TimelineState
} from './timeline';

/** Subscription handle from `agent.subscribeToThread` (subset used here). */
type ThreadSubscription = {
	processDataStream: (o: {
		onChunk: (c: unknown) => void;
		reconnect?: boolean | { maxRetries?: number; delayMs?: number };
	}) => Promise<void>;
	abort: () => Promise<boolean>;
	unsubscribe: () => void;
};

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Reactive chat-agent state for the Phase 1 slice. A class with `$state` fields (plan §3.5 — NO
 * module-level mutable state, which would leak across users under SSR). It owns exactly one
 * long-lived `subscribeToThread` and reduces its chunk stream into a timeline; `send` fires a
 * durable `sendMessage` whose output flows back through that same subscription (not awaited here).
 *
 * This is the runes half of the port of `apps/web/features/threads/lib/use-mastra-agent.ts`,
 * scoped to the normal-chat happy path that gates dealbreaker #2.
 */
export class ChatAgent {
	readonly #client: MastraClient;
	readonly #threadId: string;
	readonly #resourceId: string;
	#sub: ThreadSubscription | null = null;
	#replay = createChunkReplayFilter();
	#cancelled = false;

	/** Whole timeline as one `$state` object; reduced immutably per chunk. */
	timeline = $state<TimelineState>(initialTimeline());

	get messages(): Message[] {
		return this.timeline.messages;
	}
	get status(): TimelineState['status'] {
		return this.timeline.status;
	}
	get error(): string | undefined {
		return this.timeline.error;
	}

	constructor(opts: {
		client: MastraClient;
		threadId: string;
		resourceId: string;
		seed?: Message[];
	}) {
		this.#client = opts.client;
		this.#threadId = opts.threadId;
		this.#resourceId = opts.resourceId;
		this.timeline = initialTimeline(opts.seed ?? []);
	}

	/** Begin the single long-lived subscription. Self-heals: a brand-new thread has nothing to
	 *  subscribe to until the first `sendMessage` creates it, so subscribe failures just retry. */
	start(): void {
		void this.#loop();
	}

	#onChunk = (chunk: unknown): void => {
		const c = chunk as MastraChunk;
		if (!this.#replay(c)) return; // duplicate replay — drop before the non-idempotent reducer
		this.timeline = reduceChunk(this.timeline, c);
	};

	async #loop(): Promise<void> {
		while (!this.#cancelled) {
			try {
				const agent = this.#client.getAgent(ASTRA_AGENT_ID);
				const sub = (await agent.subscribeToThread({
					threadId: this.#threadId,
					resourceId: this.#resourceId
				})) as unknown as ThreadSubscription;
				if (this.#cancelled) {
					sub.unsubscribe();
					return;
				}
				this.#sub = sub;
				// finite maxRetries so a long outage eventually falls back to this loop's own retry.
				await sub.processDataStream({
					onChunk: this.#onChunk,
					reconnect: { maxRetries: 20, delayMs: 1000 }
				});
				if (this.#cancelled) return;
				await delay(1000); // stream ended unexpectedly → wait then re-subscribe
			} catch {
				if (this.#cancelled) return;
				await delay(1000); // subscribe failed (thread not created yet, blip) → retry
			}
		}
	}

	/** Send a durable message. Output streams back via the subscription (not awaited here). */
	async send(text: string): Promise<void> {
		const trimmed = text.trim();
		if (!trimmed || this.status !== 'ready') return;
		this.timeline = startAssistantTurn(this.timeline, trimmed);
		try {
			const agent = this.#client.getAgent(ASTRA_AGENT_ID);
			await agent.sendMessage({
				message: trimmed,
				resourceId: this.#resourceId,
				threadId: this.#threadId
			});
		} catch (err) {
			this.timeline = {
				...settleAssistantTurn(this.timeline),
				error: err instanceof Error ? err.message : 'Gagal mengirim pesan.'
			};
		}
	}

	/** Stop the active turn (server-side cancel via abortThread) — clean `abort` chunk, no error. */
	async stop(): Promise<void> {
		try {
			await this.#sub?.abort();
		} catch {
			/* best-effort */
		}
	}

	/** Tear down the subscription (call on unmount). */
	destroy(): void {
		this.#cancelled = true;
		this.#sub?.unsubscribe();
		this.#sub = null;
	}
}

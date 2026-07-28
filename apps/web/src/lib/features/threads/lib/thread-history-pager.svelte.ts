import type { MastraClient } from '@mastra/client-js';
import { readableApiErrorMessage } from '$lib/errors';
import { ASTRA_AGENT_ID } from './mastra-client';
import { mastraMessagesToTimeline } from './mastra-timeline';
import type { TimelineMessage } from './timeline-types';
import {
	THREAD_HISTORY_BATCH_SIZE,
	chronologicalHistoryBatch,
	historyQueryParams,
	oldestHistoryCursor,
	type ThreadHistoryControls
} from './thread-history';

type HistorySeed = {
	oldestCursor: number | null;
	hasOlder: boolean;
};

type HistoryAgent = {
	prependHistory(messages: readonly TimelineMessage[]): void;
};

/**
 * Owns older-history pagination (cursor, load state, fetch) next to the live agent.
 * Surfaces pass this single object instead of four prop-drilled fields.
 */
export class ThreadHistoryPager implements ThreadHistoryControls {
	hasOlder = $state(false);
	isLoadingOlder = $state(false);
	loadError = $state<string | null>(null);

	#oldestCursor = $state<number | null>(null);
	#agent: HistoryAgent | null = null;
	#getClient: () => MastraClient;
	#getThreadId: () => string;

	constructor(opts: { getClient: () => MastraClient; getThreadId: () => string }) {
		this.#getClient = opts.getClient;
		this.#getThreadId = opts.getThreadId;
	}

	seed(seed: HistorySeed | null | undefined): void {
		this.#oldestCursor = seed?.oldestCursor ?? null;
		this.hasOlder = seed?.hasOlder ?? false;
		this.loadError = null;
		this.isLoadingOlder = false;
	}

	bindAgent(agent: HistoryAgent | null): void {
		this.#agent = agent;
	}

	async loadOlder(): Promise<void> {
		const agent = this.#agent;
		const cursor = this.#oldestCursor;
		if (!agent || cursor === null || !this.hasOlder || this.isLoadingOlder) return;
		this.isLoadingOlder = true;
		this.loadError = null;
		try {
			const thread = this.#getClient().getMemoryThread({
				threadId: this.#getThreadId(),
				agentId: ASTRA_AGENT_ID
			});
			const res = await thread.listMessages(historyQueryParams(cursor));
			const raw = chronologicalHistoryBatch(res.messages ?? []);
			agent.prependHistory(mastraMessagesToTimeline(raw));
			this.#oldestCursor = oldestHistoryCursor(raw) ?? this.#oldestCursor;
			this.hasOlder = raw.length === THREAD_HISTORY_BATCH_SIZE;
		} catch (error) {
			this.loadError = readableApiErrorMessage(error, 'Pesan lama gagal dimuat.');
		} finally {
			this.isLoadingOlder = false;
		}
	}
}

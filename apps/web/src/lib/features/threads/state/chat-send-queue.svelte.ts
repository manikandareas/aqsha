import type { AgentKind } from '@aqsha/chat-core';

export type QueuedSend = {
	id: string;
	mode: 'chat' | 'deep';
	text: string;
	display: string;
	clientContext?: string[];
	richText?: string;
	attachmentIds?: string[];
	agentKind: AgentKind;
	/** Present for Mastra's durable server queue; those items cannot be cancelled client-side. */
	serverRunId?: string;
};

export type QueuedSendInput = Omit<QueuedSend, 'id' | 'serverRunId'>;
export type ServerQueuedTurn = { display: string; attachmentIds?: string[] };

let sequence = 0;

/** Reactive queue state plus the server-run registry used to birth optimistic bubbles on `start`. */
export class ChatSendQueue {
	#items = $state<QueuedSend[]>([]);
	#dispatching = false;
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transport registry is not UI state
	#serverRuns = new Map<string, ServerQueuedTurn>();

	get items(): QueuedSend[] {
		return this.#items;
	}

	addClient(input: QueuedSendInput, now: number): QueuedSend {
		const item = { ...input, id: this.#id(now) };
		this.#items = [...this.#items, item];
		return item;
	}

	addServer(input: QueuedSendInput, runId: string, now: number): QueuedSend {
		const item = { ...input, id: this.#id(now), serverRunId: runId };
		this.#serverRuns.set(runId, { display: input.display, attachmentIds: input.attachmentIds });
		this.#items = [...this.#items, item];
		return item;
	}

	consumeServerRun(runId: string): ServerQueuedTurn | null {
		const turn = this.#serverRuns.get(runId) ?? null;
		if (!turn) return null;
		this.#serverRuns.delete(runId);
		this.#items = this.#items.filter((item) => item.serverRunId !== runId);
		return turn;
	}

	beginClientDispatch(): QueuedSend | null {
		if (this.#dispatching) return null;
		const item = this.#items.find((candidate) => candidate.serverRunId === undefined) ?? null;
		if (!item) return null;
		this.#dispatching = true;
		this.#items = this.#items.filter((candidate) => candidate.id !== item.id);
		return item;
	}

	finishClientDispatch(): void {
		this.#dispatching = false;
	}

	cancelClient(id: string): void {
		this.#items = this.#items.filter((item) => item.id !== id || item.serverRunId !== undefined);
	}

	dropClientItems(): void {
		this.#items = this.#items.filter((item) => item.serverRunId !== undefined);
	}

	#id(now: number): string {
		return `q:${now}:${(sequence += 1)}`;
	}
}

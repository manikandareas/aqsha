import { QueryClient } from '@tanstack/svelte-query';
import { describe, expect, it } from 'vitest';
import type { TimelineMessage } from '../lib/timeline-types';
import { ThreadAgent, lastTurnMessageIds } from './thread-agent.svelte';

// Regenerate helper: the last [user, assistant] pair to delete from server memory, matched
// POSITIONALLY (durable-thread stores user input as a `signal`, not `role:"user"`). Importing this from
// the `.svelte.ts` module also asserts the state class module compiles + all deps resolve.

describe('lastTurnMessageIds', () => {
	it('drops the last assistant + the preceding signal (durable-thread user input)', () => {
		const msgs = [
			{ id: 'u1', role: 'signal' },
			{ id: 'a1', role: 'assistant' },
			{ id: 'u2', role: 'signal' },
			{ id: 'a2', role: 'assistant' }
		];
		expect(lastTurnMessageIds(msgs).sort()).toEqual(['a2', 'u2']);
	});

	it('drops only the trailing dangling turn (failed run left a user with no assistant)', () => {
		const msgs = [
			{ id: 'u1', role: 'signal' },
			{ id: 'a1', role: 'assistant' },
			{ id: 'u2', role: 'user' }
		];
		expect(lastTurnMessageIds(msgs)).toEqual(['u2']);
	});

	it('returns [] when there is nothing to regenerate', () => {
		expect(lastTurnMessageIds([])).toEqual([]);
	});

	it('handles role:"user" labels too (non-durable persistence)', () => {
		const msgs = [
			{ id: 'u1', role: 'user' },
			{ id: 'a1', role: 'assistant' }
		];
		expect(lastTurnMessageIds(msgs).sort()).toEqual(['a1', 'u1']);
	});
});

const message = (id: string, createdAt: number): TimelineMessage => ({
	id,
	role: 'user',
	streaming: false,
	createdAt,
	parts: [{ kind: 'text', id: `part-${id}`, text: id, streaming: false }]
});

describe('ThreadAgent.prependHistory', () => {
	it('prepends immutably and deduplicates against live messages', () => {
		const agent = new ThreadAgent({
			getClient: () => ({}) as never,
			threadId: 'thread-1',
			getResourceId: () => 'user-1',
			queryClient: new QueryClient(),
			seed: [message('m2', 2), message('m3', 3)]
		});
		const before = agent.messages;

		agent.prependHistory([message('m1', 1), message('m2', 2)]);

		expect(agent.messages.map((item) => item.id)).toEqual(['m1', 'm2', 'm3']);
		expect(agent.messages).not.toBe(before);
	});

	it('does not change stream status while older history is inserted', () => {
		const agent = new ThreadAgent({
			getClient: () => ({}) as never,
			threadId: 'thread-1',
			getResourceId: () => 'user-1',
			queryClient: new QueryClient(),
			seed: [message('m2', 2)]
		});
		const status = agent.status;

		agent.prependHistory([message('m1', 1)]);

		expect(agent.status).toBe(status);
	});
});

describe('ThreadAgent turn lifecycle', () => {
	it('reports accepted after sendMessage ack resolves, before any later work', async () => {
		const events: string[] = [];
		let releaseAck!: () => void;
		const ack = new Promise<void>((resolve) => {
			releaseAck = resolve;
		});
		const agent = new ThreadAgent({
			getClient: () =>
				({
					getAgent: () => ({
						sendMessage: async () => {
							events.push('server');
							await ack;
							return { accepted: true as const, runId: 'run-1' };
						}
					})
				}) as never,
			threadId: 'thread-1',
			getResourceId: () => 'user-1',
			queryClient: new QueryClient(),
			onAccepted: () => events.push('accepted')
		});

		const sending = agent.send('Pertahankan prompt ini');
		expect(agent.messages).toHaveLength(2);
		expect(events).toEqual(['server']);
		expect(agent.status).not.toBe('ready');

		releaseAck();
		await sending;

		// onAccepted follows the JSON ack from sendMessage — streaming continues separately.
		expect(events).toEqual(['server', 'accepted']);
	});

	it('does not report accepted when sending fails, but still settles locally', async () => {
		const accepted: string[] = [];
		const settled: string[] = [];
		const agent = new ThreadAgent({
			getClient: () =>
				({
					getAgent: () => ({
						sendMessage: async () => {
							throw new Error('network down');
						}
					})
				}) as never,
			threadId: 'thread-1',
			getResourceId: () => 'user-1',
			queryClient: new QueryClient(),
			onAccepted: () => accepted.push('thread-1'),
			onSettled: () => settled.push('thread-1')
		});

		await agent.send('Pertahankan prompt ini');

		expect(accepted).toEqual([]);
		expect(settled).toEqual(['thread-1']);
		expect(agent.status).toBe('ready');
	});
});

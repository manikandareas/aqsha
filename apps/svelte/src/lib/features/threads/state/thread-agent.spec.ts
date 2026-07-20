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

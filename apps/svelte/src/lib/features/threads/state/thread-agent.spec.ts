import { describe, expect, it } from 'vitest';
import { lastTurnMessageIds } from './thread-agent.svelte';

// Regenerate helper (THC-5): the last [user, assistant] pair to delete from server memory, matched
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

import { describe, expect, it } from 'vitest';
import {
	createChunkReplayFilter,
	initialTimeline,
	reduceChunk,
	startAssistantTurn,
	type MastraChunk,
	type TimelineState
} from './timeline';

/** Concatenated assistant text across all text parts of the last assistant message. */
function assistantText(s: TimelineState): string {
	const last = [...s.messages].reverse().find((m) => m.role === 'assistant');
	return (last?.parts ?? [])
		.filter((p) => p.kind === 'text')
		.map((p) => (p as { text: string }).text)
		.join('');
}

/** A minimal, ordered normal-chat run: start → text deltas → finish(stop). */
function chatRun(runId: string, tokens: string[], reason = 'stop'): MastraChunk[] {
	return [
		{ type: 'start', runId },
		{ type: 'text-start', runId, payload: { id: 'txt' } },
		...tokens.map((t) => ({ type: 'text-delta', runId, payload: { id: 'txt', text: t } })),
		{ type: 'finish', runId, payload: { stepResult: { reason } } }
	];
}

describe('timeline reducer', () => {
	it('assembles streamed text token-by-token and settles on finish', () => {
		let s = startAssistantTurn(initialTimeline(), 'Halo Astra');
		expect(s.status).toBe('submitted');
		for (const c of chatRun('r1', ['Hai', ', ', 'apa', ' kabar?'])) s = reduceChunk(s, c);
		expect(assistantText(s)).toBe('Hai, apa kabar?');
		expect(s.status).toBe('ready');
		// user bubble + assistant answer
		expect(s.messages.filter((m) => m.role === 'user')).toHaveLength(1);
		expect(s.messages.at(-1)!.streaming).toBe(false);
	});

	it('keeps streaming when finish reason is tool-calls (multi-step turn)', () => {
		let s = initialTimeline();
		s = reduceChunk(s, { type: 'start', runId: 'r1' });
		s = reduceChunk(s, {
			type: 'tool-call',
			runId: 'r1',
			payload: { toolCallId: 'tc1', toolName: 'search_web' }
		});
		s = reduceChunk(s, {
			type: 'finish',
			runId: 'r1',
			payload: { stepResult: { reason: 'tool-calls' } }
		});
		expect(s.status).toBe('streaming');
		s = reduceChunk(s, {
			type: 'tool-result',
			runId: 'r1',
			payload: { toolCallId: 'tc1', toolName: 'search_web' }
		});
		s = reduceChunk(s, { type: 'text-delta', runId: 'r1', payload: { id: 't', text: 'Selesai.' } });
		s = reduceChunk(s, {
			type: 'finish',
			runId: 'r1',
			payload: { stepResult: { reason: 'stop' } }
		});
		expect(s.status).toBe('ready');
		expect(assistantText(s)).toBe('Selesai.');
		const tool = s.messages.at(-1)!.parts.find((p) => p.kind === 'tool');
		expect(tool && tool.kind === 'tool' && tool.status).toBe('completed');
	});

	it('is idempotent under full buffer replay (no duplicate tokens) — the "no dup/lost" guarantee', () => {
		const filter = createChunkReplayFilter();
		const run = chatRun('r1', ['token-A ', 'token-B ', 'token-C']);
		let s = startAssistantTurn(initialTimeline(), 'q');
		// First connect: apply the whole run.
		for (const c of run) if (filter(c)) s = reduceChunk(s, c);
		const once = assistantText(s);
		expect(once).toBe('token-A token-B token-C');
		// Reconnect: server replays the SAME buffer from index 0. The filter must drop every chunk.
		for (const c of run) if (filter(c)) s = reduceChunk(s, c);
		expect(assistantText(s)).toBe(once); // unchanged — no doubled text
	});

	it('resumes correctly when a reconnect replays a prefix then diverges (partial replay)', () => {
		const filter = createChunkReplayFilter();
		let s = startAssistantTurn(initialTimeline(), 'q');
		const head: MastraChunk[] = [
			{ type: 'start', runId: 'r1' },
			{ type: 'text-start', runId: 'r1', payload: { id: 'txt' } },
			{ type: 'text-delta', runId: 'r1', payload: { id: 'txt', text: 'Bagian-1 ' } }
		];
		for (const c of head) if (filter(c)) s = reduceChunk(s, c);
		// Reconnect: replay the prefix (dropped) THEN new tail tokens (applied once).
		const replayThenMore: MastraChunk[] = [
			...head,
			{ type: 'text-delta', runId: 'r1', payload: { id: 'txt', text: 'Bagian-2' } },
			{ type: 'finish', runId: 'r1', payload: { stepResult: { reason: 'stop' } } }
		];
		for (const c of replayThenMore) if (filter(c)) s = reduceChunk(s, c);
		expect(assistantText(s)).toBe('Bagian-1 Bagian-2');
		expect(s.status).toBe('ready');
	});

	it('settles with an error banner on an error chunk', () => {
		let s = startAssistantTurn(initialTimeline(), 'q');
		s = reduceChunk(s, { type: 'start', runId: 'r1' });
		s = reduceChunk(s, {
			type: 'error',
			runId: 'r1',
			payload: { error: { message: 'provider down' } }
		});
		expect(s.status).toBe('ready');
		expect(s.error).toContain('provider down');
	});
});

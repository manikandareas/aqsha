import { describe, expect, it } from 'vitest';
import { createChunkReplayFilter } from './chunk-replay';
import type { MastraChunk } from './mastra-timeline';

// Contract tests for the replay/idempotency filter ("no duplicate / lost tokens" gate). The
// subscription replays each in-flight run's buffer from index 0 on every reconnect; the filter must
// drop exact replays but let genuine new chunks (and unrelated runs) through.

const c = (type: string, payload?: Record<string, unknown>, runId = 'r1'): MastraChunk => ({
	type,
	runId,
	...(payload ? { payload } : {})
});

describe('createChunkReplayFilter', () => {
	it('lets a fresh stream through, then drops an identical replay from index 0', () => {
		const filter = createChunkReplayFilter();
		const stream = [
			c('start'),
			c('text-delta', { id: 'x', text: 'a' }),
			c('text-delta', { id: 'x', text: 'b' })
		];
		// First pass: all applied.
		expect(stream.map(filter)).toEqual([true, true, true]);
		// Reconnect replays the same buffer → all dropped (no duplicate tokens).
		expect(stream.map(filter)).toEqual([false, false, false]);
	});

	it('applies NEW chunks that arrive after a replayed prefix', () => {
		const filter = createChunkReplayFilter();
		const base = [c('start'), c('text-delta', { id: 'x', text: 'a' })];
		base.forEach(filter); // apply
		// Reconnect: replay prefix (dropped) then a genuinely new delta (applied).
		expect(filter(c('start'))).toBe(false);
		expect(filter(c('text-delta', { id: 'x', text: 'a' }))).toBe(false);
		expect(filter(c('text-delta', { id: 'x', text: 'c' }))).toBe(true);
	});

	it('never drops chunks without a runId', () => {
		const filter = createChunkReplayFilter();
		const noRun: MastraChunk = { type: 'text-delta', payload: { text: 'x' } };
		expect(filter(noRun)).toBe(true);
		expect(filter(noRun)).toBe(true);
	});

	it('keeps separate runs independent', () => {
		const filter = createChunkReplayFilter();
		expect(filter(c('text-delta', { text: 'a' }, 'r1'))).toBe(true);
		expect(filter(c('text-delta', { text: 'a' }, 'r2'))).toBe(true); // same sig, different run
	});

	it('forgets a terminal run so a later reused runId is treated as new', () => {
		const filter = createChunkReplayFilter();
		filter(c('start'));
		filter(c('text-delta', { text: 'a' }));
		expect(filter(c('finish', { reason: 'stop' }))).toBe(true); // terminal → run purged
		// A brand-new run reusing the id is NOT a replay.
		expect(filter(c('start'))).toBe(true);
	});
});

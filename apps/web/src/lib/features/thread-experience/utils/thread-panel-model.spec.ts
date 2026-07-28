import { describe, expect, it } from 'vitest';
import {
	type ThreadPanelMode,
	panelModeFromParam,
	panelParamFor,
	parseThreadPanelMode,
	serializeThreadPanelMode,
	threadPanelTabOf
} from './thread-panel-model';

// URL codec contract for the `panel` query param. Serialization must stay stable so deep links
// round-trip; vectors match the string forms documented in `thread-panel-model.ts`.

const VECTORS: Array<[ThreadPanelMode, string]> = [
	[{ kind: 'context' }, 'c'],
	[{ kind: 'questions' }, 'x'],
	[{ kind: 'sources' }, 'm'],
	[{ kind: 'sources', messageId: 'msg-1' }, 'm:msg-1'],
	[{ kind: 'stats' }, 's'],
	[{ kind: 'stats', runKey: 'run:abc' }, 's:run:abc'],
	[{ kind: 'plan', turnId: 'turn-9' }, 'p:turn-9'],
	[{ kind: 'artifact', artifactId: 'art:1:2' }, 'a:art:1:2'],
	[{ kind: 'step', toolCallId: 'call-77' }, 't:call-77'],
	[{ kind: 'search', turnId: 'turn:x', subQuestionIndex: 3 }, 'q:turn:x:3']
];

describe('thread panel URL codec', () => {
	it('serializes every mode to its exact string form', () => {
		for (const [mode, str] of VECTORS) expect(serializeThreadPanelMode(mode)).toBe(str);
	});

	it('round-trips every string back to the same mode', () => {
		for (const [mode, str] of VECTORS) expect(parseThreadPanelMode(str)).toEqual(mode);
	});

	it('id-bearing modes split on the FIRST colon (ids keep their own colons)', () => {
		expect(parseThreadPanelMode('a:art:1:2')).toEqual({ kind: 'artifact', artifactId: 'art:1:2' });
		expect(parseThreadPanelMode('s:run:abc')).toEqual({ kind: 'stats', runKey: 'run:abc' });
	});

	it('search keeps the trailing numeric index after the LAST colon', () => {
		expect(parseThreadPanelMode('q:turn:x:3')).toEqual({
			kind: 'search',
			turnId: 'turn:x',
			subQuestionIndex: 3
		});
	});

	it('rejects non-strict-digit search indices → closed', () => {
		for (const bad of ['q:turn:1e3', 'q:turn:0x5', 'q:turn: 1', 'q:turn:', 'q::3']) {
			expect(parseThreadPanelMode(bad).kind).toBe('closed');
		}
	});

	it('empty-id "m:" / "s:" read as the aggregate tab; empty other ids → closed', () => {
		expect(parseThreadPanelMode('m:')).toEqual({ kind: 'sources' });
		expect(parseThreadPanelMode('s:')).toEqual({ kind: 'stats' });
		expect(parseThreadPanelMode('a:').kind).toBe('closed');
		expect(parseThreadPanelMode('p:').kind).toBe('closed');
	});

	it('closed serializes to null and an absent/empty param parses to closed', () => {
		expect(serializeThreadPanelMode({ kind: 'closed' })).toBeNull();
		expect(panelParamFor({ kind: 'closed' })).toBeNull();
		expect(panelModeFromParam(null).kind).toBe('closed');
		expect(panelModeFromParam('').kind).toBe('closed');
		expect(panelModeFromParam(undefined).kind).toBe('closed');
	});

	it('maps modes to their tab', () => {
		expect(threadPanelTabOf({ kind: 'context' })).toBe('workspace');
		expect(threadPanelTabOf({ kind: 'sources' })).toBe('sources');
		expect(threadPanelTabOf({ kind: 'stats' })).toBe('statistics');
		expect(threadPanelTabOf({ kind: 'plan', turnId: 't' })).toBe('preview');
		expect(threadPanelTabOf({ kind: 'closed' })).toBeNull();
	});
});

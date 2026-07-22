import { describe, expect, it } from 'vitest';
import {
	dropLastTurn,
	initialMastraTimeline,
	mastraMessagesToTimeline,
	type MastraChunk,
	reduceMastraChunk,
	reduceWorkflowChunk,
	seedWorkflowProgress,
	settleAssistantTurn,
	settleWorkflowTurn,
	startAssistantTurn,
	startRegenerate,
	type MastraTimelineState
} from './mastra-timeline';
import type { TimelineMessage, TimelinePart } from './timeline-types';

// Contract tests for the timeline reducer. Correctness-critical: pins the exact reduction of the Mastra
// chunk vocabulary → the presentation timeline ("no duplicate / lost message").

const chunk = (type: string, payload?: Record<string, unknown>, runId?: string): MastraChunk => ({
	type,
	...(runId ? { runId } : {}),
	...(payload ? { payload } : {})
});

/** Reduce a sequence of chat chunks over a base state. */
const reduceAll = (state: MastraTimelineState, chunks: MastraChunk[]): MastraTimelineState =>
	chunks.reduce((s, c) => reduceMastraChunk(s, c), state);

const lastAssistant = (s: MastraTimelineState): TimelineMessage =>
	[...s.messages].reverse().find((m) => m.role === 'assistant')!;

const textOf = (m: TimelineMessage): string =>
	m.parts
		.filter((p): p is Extract<TimelinePart, { kind: 'text' }> => p.kind === 'text')
		.map((p) => p.text)
		.join('');

describe('initial + optimistic turn', () => {
	it('starts empty and ready', () => {
		const s = initialMastraTimeline();
		expect(s.status).toBe('ready');
		expect(s.messages).toEqual([]);
		expect(s.approvals).toEqual([]);
	});

	it('startAssistantTurn appends a user bubble + streaming assistant placeholder', () => {
		const s = startAssistantTurn(initialMastraTimeline(), 'Halo Astra', 't1');
		expect(s.status).toBe('submitted');
		expect(s.messages).toHaveLength(2);
		const [user, assistant] = s.messages;
		expect(user.role).toBe('user');
		expect(user.id).toBe('t1:user');
		expect(textOf(user)).toBe('Halo Astra');
		expect(assistant.role).toBe('assistant');
		expect(assistant.streaming).toBe(true);
		expect(assistant.parts).toEqual([]);
	});

	it('carries attachmentIds onto the user bubble when provided', () => {
		const s = startAssistantTurn(initialMastraTimeline(), 'lihat file', 't2', ['a1', 'a2']);
		expect(s.messages[0].attachmentIds).toEqual(['a1', 'a2']);
	});
});

describe('text streaming (no dup / lost tokens)', () => {
	it('concatenates text deltas into one part and settles on finish', () => {
		let s = startAssistantTurn(initialMastraTimeline(), 'q', 't1');
		s = reduceAll(s, [
			chunk('start', {}, 'r1'),
			chunk('text-start', { id: 'x' }),
			chunk('text-delta', { id: 'x', text: 'Hello ' }),
			chunk('text-delta', { id: 'x', text: 'world' }),
			chunk('finish', { reason: 'stop' }, 'r1')
		]);
		const a = lastAssistant(s);
		expect(textOf(a)).toBe('Hello world');
		expect(a.streaming).toBe(false);
		expect(a.parts.filter((p) => p.kind === 'text')).toHaveLength(1);
		expect(s.status).toBe('ready');
	});

	it('finish with reason=tool-calls keeps streaming (more steps pending)', () => {
		let s = startAssistantTurn(initialMastraTimeline(), 'q', 't1');
		s = reduceAll(s, [
			chunk('start', {}, 'r1'),
			chunk('text-start', { id: 'x' }),
			chunk('text-delta', { id: 'x', text: 'partial' }),
			chunk('finish', { stepResult: { reason: 'tool-calls' } }, 'r1')
		]);
		expect(s.status).toBe('streaming');
		expect(lastAssistant(s).streaming).toBe(true);
	});

	it('resumes: creates an assistant placeholder when none is streaming (refresh replay)', () => {
		// A user bubble only (no optimistic assistant) — the replayed run buffer must birth one.
		let s: MastraTimelineState = {
			...initialMastraTimeline([
				{ id: 'u', role: 'user', streaming: false, createdAt: 1, parts: [] }
			])
		};
		s = reduceAll(s, [
			chunk('start', {}, 'r1'),
			chunk('text-delta', { id: 'x', text: 'resumed' }, 'r1')
		]);
		const a = lastAssistant(s);
		expect(a).toBeDefined();
		expect(textOf(a)).toBe('resumed');
	});
});

describe('reasoning parts', () => {
	it('streams reasoning and clears thinking on reasoning-end', () => {
		let s = startAssistantTurn(initialMastraTimeline(), 'q', 't1');
		s = reduceAll(s, [
			chunk('reasoning-start', { id: 'g' }),
			chunk('reasoning-delta', { id: 'g', text: 'thinking...' }),
			chunk('reasoning-end', { id: 'g' })
		]);
		const part = lastAssistant(s).parts.find((p) => p.kind === 'reasoning');
		expect(part).toMatchObject({ kind: 'reasoning', text: 'thinking...', thinking: false });
	});
});

describe('tool parts', () => {
	it('tool-call → running row, tool-result → completed with description', () => {
		let s = startAssistantTurn(initialMastraTimeline(), 'q', 't1');
		s = reduceMastraChunk(
			s,
			chunk('tool-call', { toolCallId: 'c1', toolName: 'search_web', args: { query: 'x' } })
		);
		let tool = lastAssistant(s).parts.find((p) => p.kind === 'tool');
		expect(tool).toMatchObject({ kind: 'tool' });
		if (tool?.kind === 'tool') {
			expect(tool.model.status).toBe('running');
			expect(tool.model.title).toBe('Mencari web');
			expect(tool.model.rows).toContainEqual({
				key: 'query',
				label: 'Kueri',
				value: 'x',
				group: 'input'
			});
		}
		s = reduceMastraChunk(
			s,
			chunk('tool-result', {
				toolCallId: 'c1',
				toolName: 'search_web',
				result: { results: [1, 2, 3] }
			})
		);
		tool = lastAssistant(s).parts.find((p) => p.kind === 'tool');
		if (tool?.kind === 'tool') {
			expect(tool.model.status).toBe('completed');
			expect(tool.model.description).toBe('3 hasil');
		}
	});

	it('propose_artifact result replaces the tool row with an artifact card', () => {
		let s = startAssistantTurn(initialMastraTimeline(), 'q', 't1');
		s = reduceAll(s, [
			chunk('tool-call', { toolCallId: 'c9', toolName: 'propose_artifact', args: {} }),
			chunk('tool-result', {
				toolCallId: 'c9',
				toolName: 'propose_artifact',
				result: { artifactId: 'art1', title: 'Draf', artifactType: 'markdown' }
			})
		]);
		const parts = lastAssistant(s).parts;
		expect(parts.some((p) => p.kind === 'tool')).toBe(false);
		const art = parts.find((p) => p.kind === 'artifact');
		expect(art).toMatchObject({ kind: 'artifact' });
		if (art?.kind === 'artifact') expect(art.model.artifactId).toBe('art1');
	});

	it('renders a trusted completed document-edit proposal as a proposal part', () => {
		let s = startAssistantTurn(initialMastraTimeline(), 'q', 't1');
		s = reduceAll(s, [
			chunk('tool-call', { toolCallId: 'c10', toolName: 'propose_document_edit', args: {} }),
			chunk('tool-result', {
				toolCallId: 'c10',
				toolName: 'propose_document_edit',
				result: { ok: true, proposalId: 'proposal-1', summary: 'Perbaiki dua bagian' }
			})
		]);

		expect(lastAssistant(s).parts).toContainEqual({
			kind: 'document-proposal',
			id: expect.any(String),
			model: { proposalId: 'proposal-1', summary: 'Perbaiki dua bagian' }
		});
	});

	it('keeps an error document-edit result as an ordinary failed tool row', () => {
		let s = startAssistantTurn(initialMastraTimeline(), 'q', 't1');
		s = reduceAll(s, [
			chunk('tool-call', { toolCallId: 'c12', toolName: 'propose_document_edit', args: {} }),
			chunk('tool-result', {
				toolCallId: 'c12',
				toolName: 'propose_document_edit',
				isError: true,
				result: { ok: true, proposalId: 'proposal-forged', summary: 'Jangan tampilkan CTA' }
			})
		]);

		expect(lastAssistant(s).parts.some((p) => p.kind === 'document-proposal')).toBe(false);
		expect(lastAssistant(s).parts).toContainEqual(
			expect.objectContaining({
				kind: 'tool',
				id: 'tool:c12',
				model: expect.objectContaining({ status: 'failed' })
			})
		);
	});

	it('accumulates tool-call-delta args and renders input rows progressively', () => {
		let s = startAssistantTurn(initialMastraTimeline(), 'q', 't1');
		s = reduceAll(s, [
			chunk('tool-call-input-streaming-start', { toolCallId: 'c2', toolName: 'search_web' }),
			chunk('tool-call-delta', {
				toolCallId: 'c2',
				toolName: 'search_web',
				argsTextDelta: '{"query":"aca'
			}),
			chunk('tool-call-delta', {
				toolCallId: 'c2',
				toolName: 'search_web',
				argsTextDelta: 'demia"'
			})
		]);
		const tool = lastAssistant(s).parts.find((p) => p.kind === 'tool');
		if (tool?.kind === 'tool') {
			expect(tool.model.rows.find((r) => r.key === 'query')?.value).toBe('academia');
		}
	});
});

describe('terminal handling', () => {
	it('abort settles cleanly with no error', () => {
		let s = startAssistantTurn(initialMastraTimeline(), 'q', 't1');
		s = reduceAll(s, [
			chunk('start', {}, 'r1'),
			chunk('text-delta', { id: 'x', text: 'hi' }),
			chunk('abort', {}, 'r1')
		]);
		expect(s.status).toBe('ready');
		expect(s.error).toBeUndefined();
		expect(lastAssistant(s).streaming).toBe(false);
	});

	it('error AFTER answer text → truncation banner (retry hint)', () => {
		let s = startAssistantTurn(initialMastraTimeline(), 'q', 't1');
		s = reduceAll(s, [
			chunk('text-start', { id: 'x' }),
			chunk('text-delta', { id: 'x', text: 'partial answer' }),
			chunk('error', { error: { message: 'boom' } })
		]);
		expect(s.error).toContain('terpotong');
	});

	it('error BEFORE any answer text → full error message', () => {
		let s = startAssistantTurn(initialMastraTimeline(), 'q', 't1');
		s = reduceAll(s, [
			chunk('tool-call', { toolCallId: 'c1', toolName: 'search_web', args: {} }),
			chunk('error', { error: { message: 'provider down' } })
		]);
		expect(s.error).toBe('provider down');
	});

	it('tripwire settles with the policy reason', () => {
		let s = startAssistantTurn(initialMastraTimeline(), 'q', 't1');
		s = reduceMastraChunk(s, chunk('tripwire', { reason: 'Kuota habis' }));
		expect(s.error).toBe('Kuota habis');
		expect(s.status).toBe('ready');
	});
});

describe('ask-gate (ask_questions tool suspend)', () => {
	it('sets an askGate on tool-call-suspended and keeps status pending', () => {
		let s = startAssistantTurn(initialMastraTimeline(), 'q', 't1');
		s = reduceMastraChunk(
			s,
			chunk(
				'tool-call-suspended',
				{
					toolCallId: 'c1',
					suspendPayload: {
						questions: [
							{
								id: 'q1',
								kind: 'single',
								prompt: 'Fokus?',
								options: [{ label: 'A' }, { label: 'B' }]
							}
						]
					}
				},
				'r1'
			)
		);
		expect(s.askGate).toBeDefined();
		expect(s.askGate?.source).toBe('tool');
		expect(s.askGate?.toolCallId).toBe('c1');
		// finish must NOT return status to ready while a gate hangs.
		s = reduceMastraChunk(s, chunk('finish', { reason: 'stop' }, 'r1'));
		expect(s.status).not.toBe('ready');
	});

	it('clears the askGate when its tool later settles (replay-safe)', () => {
		let s = startAssistantTurn(initialMastraTimeline(), 'q', 't1');
		s = reduceMastraChunk(
			s,
			chunk(
				'tool-call-suspended',
				{
					toolCallId: 'c1',
					suspendPayload: {
						questions: [
							{ id: 'q1', kind: 'single', prompt: 'x', options: [{ label: 'A' }, { label: 'B' }] }
						]
					}
				},
				'r1'
			)
		);
		expect(s.askGate).toBeDefined();
		s = reduceMastraChunk(
			s,
			chunk('tool-result', { toolCallId: 'c1', toolName: 'ask_questions', result: {} })
		);
		expect(s.askGate).toBeUndefined();
	});
});

describe('regenerate / dropLastTurn', () => {
	it('startRegenerate removes the last assistant, keeps the user bubble, adds a fresh placeholder', () => {
		let s = startAssistantTurn(initialMastraTimeline(), 'q', 't1');
		s = reduceAll(s, [
			chunk('text-delta', { id: 'x', text: 'old answer' }),
			chunk('finish', { reason: 'stop' }, 'r1')
		]);
		s = startRegenerate(s);
		expect(s.messages.filter((m) => m.role === 'user')).toHaveLength(1);
		const a = lastAssistant(s);
		expect(a.streaming).toBe(true);
		expect(textOf(a)).toBe('');
		expect(s.status).toBe('submitted');
	});

	it('dropLastTurn removes the last [user, assistant] pair', () => {
		let s = startAssistantTurn(initialMastraTimeline(), 'first', 't1');
		s = reduceMastraChunk(s, chunk('finish', { reason: 'stop' }, 'r1'));
		s = startAssistantTurn(s, 'second', 't2');
		s = dropLastTurn(s);
		expect(s.messages).toHaveLength(2);
		expect(textOf(s.messages[0])).toBe('first');
	});
});

describe('workflow /deep reduction', () => {
	it('tags the assistant turn with runId on workflow-start', () => {
		let s = startAssistantTurn(initialMastraTimeline(), 'riset', 't1');
		s = reduceWorkflowChunk(s, chunk('workflow-start', {}, 'run-1'));
		expect(lastAssistant(s).turnId).toBe('run-1');
		expect(s.status).toBe('streaming');
	});

	it('sets a plan-gate on approve-plan suspend and preserves it across workflow-finish', () => {
		let s = startAssistantTurn(initialMastraTimeline(), 'riset', 't1');
		s = reduceWorkflowChunk(s, chunk('workflow-start', {}, 'run-1'));
		s = reduceWorkflowChunk(
			s,
			chunk(
				'workflow-step-suspended',
				{
					id: 'approve-plan',
					suspendPayload: { plan: 'rencana', subQuestions: ['a', 'b'] }
				},
				'run-1'
			)
		);
		expect(s.planGate).toEqual({ plan: 'rencana', subQuestions: ['a', 'b'] });
		// closeOnSuspend emits workflow-finish while the gate is open → must NOT settle.
		s = reduceWorkflowChunk(s, chunk('workflow-finish', {}, 'run-1'));
		expect(s.planGate).toBeDefined();
		expect(s.status).toBe('streaming');
	});

	it('writes the synthesize report as the answer text', () => {
		let s = startAssistantTurn(initialMastraTimeline(), 'riset', 't1');
		s = reduceWorkflowChunk(s, chunk('workflow-start', {}, 'run-1'));
		s = reduceWorkflowChunk(
			s,
			chunk('workflow-step-result', { id: 'synthesize', output: { report: '# Laporan' } }, 'run-1')
		);
		expect(textOf(lastAssistant(s))).toContain('# Laporan');
	});

	it('settleWorkflowTurn settles the turn tagged with the runId (not by position)', () => {
		let s = startAssistantTurn(initialMastraTimeline(), 'riset', 't1');
		s = reduceWorkflowChunk(s, chunk('workflow-start', {}, 'run-1'));
		s = settleWorkflowTurn(s, 'run-1');
		expect(lastAssistant(s).streaming).toBe(false);
		expect(s.status).toBe('ready');
	});
});

describe('seedWorkflowProgress (refresh re-attach)', () => {
	it('rebuilds the stepper + report from a runById snapshot, idempotently', () => {
		let s = startAssistantTurn(initialMastraTimeline(), 'riset', 't1');
		const steps = {
			'draft-plan': { status: 'success', output: { plan: 'p', subQuestions: ['x'] } },
			'search-literature': { status: 'success', output: { subQuestions: ['x'] } },
			synthesize: { status: 'success', output: { report: 'Hasil' } }
		};
		s = seedWorkflowProgress(s, 'run-1', steps);
		const a = lastAssistant(s);
		expect(a.turnId).toBe('run-1');
		expect(textOf(a)).toContain('Hasil');
		const toolCount = a.parts.filter((p) => p.kind === 'tool').length;
		// Re-seeding must not duplicate steps or the turn.
		const s2 = seedWorkflowProgress(s, 'run-1', steps);
		expect(s2.messages.filter((m) => m.role === 'assistant')).toHaveLength(1);
		expect(lastAssistant(s2).parts.filter((p) => p.kind === 'tool')).toHaveLength(toolCount);
	});
});

describe('mastraMessagesToTimeline (rehydrate)', () => {
	it('treats a durable-thread user signal as a user bubble', () => {
		const out = mastraMessagesToTimeline([
			{
				id: 'm1',
				role: 'signal',
				type: 'user',
				createdAt: 1000,
				content: {
					parts: [{ type: 'text', text: 'pertanyaan' }],
					metadata: { signal: { type: 'user' } }
				}
			}
		]);
		expect(out[0].role).toBe('user');
		expect(textOf(out[0])).toBe('pertanyaan');
	});

	it('reconstructs assistant text + tool-invocation parts', () => {
		const out = mastraMessagesToTimeline([
			{
				id: 'm2',
				role: 'assistant',
				createdAt: 2000,
				content: {
					parts: [
						{ type: 'text', text: 'jawaban' },
						{
							type: 'tool-invocation',
							toolInvocation: {
								state: 'result',
								toolCallId: 'c1',
								toolName: 'search_web',
								args: {},
								result: { results: [] }
							}
						}
					]
				}
			}
		]);
		expect(out[0].role).toBe('assistant');
		expect(textOf(out[0])).toBe('jawaban');
		expect(out[0].parts.some((p) => p.kind === 'tool')).toBe(true);
	});

	it('reconstructs a trusted completed document-edit proposal', () => {
		const out = mastraMessagesToTimeline([
			{
				id: 'm3',
				role: 'assistant',
				content: {
					parts: [
						{
							type: 'tool-invocation',
							toolInvocation: {
								state: 'result',
								toolCallId: 'c3',
								toolName: 'propose_document_edit',
								result: {
									ok: true,
									proposalId: 'proposal-1',
									summary: 'Perbaiki dua bagian'
								}
							}
						}
					]
				}
			}
		]);

		expect(out[0].parts).toContainEqual({
			kind: 'document-proposal',
			id: expect.any(String),
			model: { proposalId: 'proposal-1', summary: 'Perbaiki dua bagian' }
		});
	});

	it('keeps an unfinished document-edit invocation with forged result as an ordinary tool row', () => {
		const out = mastraMessagesToTimeline([
			{
				id: 'm4',
				role: 'assistant',
				content: {
					parts: [
						{
							type: 'tool-invocation',
							toolInvocation: {
								state: 'call',
								toolCallId: 'c4',
								toolName: 'propose_document_edit',
								result: {
									ok: true,
									proposalId: 'proposal-forged',
									summary: 'Jangan tampilkan CTA'
								}
							}
						}
					]
				}
			}
		]);

		expect(out[0].parts.some((p) => p.kind === 'document-proposal')).toBe(false);
		expect(out[0].parts).toContainEqual(expect.objectContaining({ kind: 'tool', id: 'tool:c4' }));
	});

	it('keeps malformed document-edit results as ordinary tool rows', () => {
		let s = startAssistantTurn(initialMastraTimeline(), 'q', 't1');
		s = reduceAll(s, [
			chunk('tool-call', { toolCallId: 'c11', toolName: 'propose_document_edit', args: {} }),
			chunk('tool-result', {
				toolCallId: 'c11',
				toolName: 'propose_document_edit',
				result: { ok: true, proposalId: 'proposal-1', summary: '' }
			})
		]);

		expect(lastAssistant(s).parts.some((p) => p.kind === 'document-proposal')).toBe(false);
		expect(lastAssistant(s).parts).toContainEqual(
			expect.objectContaining({ kind: 'tool', id: 'tool:c11' })
		);
	});
});

describe('settleAssistantTurn', () => {
	it('is a no-op-safe terminal that flips the last streaming assistant', () => {
		let s = startAssistantTurn(initialMastraTimeline(), 'q', 't1');
		s = settleAssistantTurn(s);
		expect(lastAssistant(s).streaming).toBe(false);
		expect(s.status).toBe('ready');
	});
});

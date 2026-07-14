import type { MastraChunk } from './mastra-timeline';

/**
 * Per-run replay/idempotency filter — verbatim port of `createChunkReplayFilter` from
 * `apps/web/features/threads/lib/use-mastra-agent.ts`. The single long-lived `subscribeToThread`
 * replays the ENTIRE buffer of an in-flight run from index 0 on every (re)connect (refresh, network
 * blip, or lite→pro channel flip mid-run). `text-delta` reduction APPENDS (non-idempotent), so a
 * replayed chunk must be dropped before it reaches the reducer. This is the guarantee behind
 * "no duplicate / no lost tokens" (§10 Phase 6 gate).
 *
 * Pure/framework-agnostic (no runes) so it is contract-tested independent of the Svelte state class,
 * which owns one instance per subscription.
 */
export function createChunkReplayFilter(): (chunk: MastraChunk) => boolean {
	const runs = new Map<string, { applied: string[]; cursor: number }>();
	const sigOf = (chunk: MastraChunk): string => {
		try {
			return `${chunk.type}:${JSON.stringify(chunk.payload ?? null)}`;
		} catch {
			return `${chunk.type}:?`; // unserializable payload (e.g. circular) → never skip
		}
	};
	const isTerminal = (chunk: MastraChunk): boolean => {
		if (chunk.type === 'abort' || chunk.type === 'error') return true;
		if (chunk.type !== 'finish') return false;
		const payload = chunk.payload ?? {};
		const stepResult = payload.stepResult;
		const reason =
			stepResult && typeof stepResult === 'object' && 'reason' in stepResult
				? String((stepResult as { reason?: unknown }).reason ?? '')
				: String(payload.reason ?? '');
		return reason !== 'tool-calls';
	};
	return (chunk) => {
		const runId = chunk.runId;
		if (!runId || !chunk.type) return true;
		let run = runs.get(runId);
		if (!run) {
			run = { applied: [], cursor: 0 };
			runs.set(runId, run);
		}
		const sig = sigOf(chunk);
		if (chunk.type === 'start') {
			const idx = run.applied.indexOf(sig);
			run.cursor = idx >= 0 ? idx : run.applied.length;
		}
		if (run.cursor < run.applied.length) {
			if (run.applied[run.cursor] === sig) {
				run.cursor += 1;
				return false; // duplicate replay — already applied
			}
			run.cursor = run.applied.length; // divergence from prefix → not a pure replay
		}
		run.applied.push(sig);
		run.cursor = run.applied.length;
		if (isTerminal(chunk)) runs.delete(runId);
		return true;
	};
}

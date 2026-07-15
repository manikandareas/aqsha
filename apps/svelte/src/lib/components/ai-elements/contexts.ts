import type { StatsGroup } from '@aqsha/chat-core/stats-viz';

// Gate types + numbering for the Streamdown adapter. Anti-forgery gates are reactive snippet props:
// `Response` passes gate data down through custom-tag snippets, and each figure component gates on
// whether that data is PRESENT (a `/deep` report → viz assigner present; a message with real
// `run_analysis` groups → stats value present). Svelte `setContext` is init-only, but stats groups can
// arrive AFTER the stream (DB fetch), so a prop is the correct reactive carrier.

/** Figure/table document-order numberer (deep-viz + stats). Its PRESENCE gates a trusted report. */
export type VizFigureAssign = (id: string) => number;

/** Stats gate value: the real DB groups + numberers. Absent OR missing runKey → render nothing. */
export type StatsVizContextValue = {
	groups: Map<string, StatsGroup>;
	assignTable: (id: string) => number;
	assignFigure: (id: string) => number;
};

/**
 * Idempotent document-order numberer over a private registry — plain closure, NOT reactive state.
 * Created once per `Response` instance so numbering is per-message and survives re-render without re-init.
 */
export function createNumberer(): VizFigureAssign {
	const registry = new Map<string, number>();
	return (id: string) => {
		const existing = registry.get(id);
		if (existing !== undefined) return existing;
		const next = registry.size + 1;
		registry.set(id, next);
		return next;
	};
}

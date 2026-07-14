import type { StatsGroup } from '@aqsha/chat-core/stats-viz';

// Gate types + numbering for the Streamdown adapter (THC-6). Ported from the React providers
// (`inline-citation.tsx` CitationProvider, `viz-context.tsx` VizFigureProvider, `stats-context.tsx`
// StatsBlocksProvider). The anti-forgery GATE is preserved, but adapted from React context to REACTIVE
// SNIPPET PROPS: `Response` passes the gate data down through the custom-tag snippets, and each figure
// component gates on whether that data is PRESENT (a `/deep` report → viz assigner present; a message
// with real `run_analysis` groups → stats value present). This keeps the exact "present + real data"
// semantics while staying reactive — Svelte `setContext` is init-only, but stats groups can arrive
// AFTER the stream (DB fetch), so a prop is the correct, reactive carrier. Documented in the Phase 6
// decision record.

/** Figure/table document-order numberer (deep-viz + stats). Its PRESENCE gates a trusted report. */
export type VizFigureAssign = (id: string) => number;

/** Stats gate value: the real DB groups + numberers. Absent OR missing runKey → render nothing. */
export type StatsVizContextValue = {
	groups: Map<string, StatsGroup>;
	assignTable: (id: string) => number;
	assignFigure: (id: string) => number;
};

/**
 * Idempotent document-order numberer over a private registry — plain closure, NOT reactive state
 * (mirror of the React `useRef(new Map)` + `assignFrom`). Created ONCE per `Response` instance so
 * numbering is per-message and survives re-render without re-init.
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

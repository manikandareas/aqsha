import { MediaQuery } from 'svelte/reactivity';

/**
 * Whether the detail side-panel docks inline (wide viewport) vs. overlays as a bottom
 * drawer (narrow). Single source for the inline breakpoint + its SSR default, shared by
 * `DetailSplitLayout`, `ResponsiveSidePanel`, and `SidePanelFrame` so the three never disagree.
 * The fallback `true` (inline) matches the most common desktop client for first paint / SSR.
 *
 * `svelte/reactivity`'s `MediaQuery` wraps the query in `(...)`, so pass it bare (matching
 * the shadcn-svelte `IsMobile` convention).
 */
export class PanelInline extends MediaQuery {
	constructor() {
		super('min-width: 1100px', true);
	}
}

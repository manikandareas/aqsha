// Detection of `{{stats:<runKey>}}` markers in an answer's prose (written by the model when it places
// a `run_analysis` result) → the `<statsviz>` custom render gated by `StatsBlocksProvider`.
//
// ── DIVERGENCE FROM WEB (rehype → marked) ────────────────────────────────────────────────────────
// Web splits the marker out of a HAST text node in the `reportRehypePlugin` rehype walk. svelte-streamdown
// is marked-based, so `apps/svelte` registers a marked INLINE extension (`aqshaStatsExtension`, in the
// Streamdown adapter) using `MARKER_RE` below, producing a custom token rendered by the `children`
// catch-all snippet → `StatsVizFigure` (gated). The pure regex + marker-parse stays here, contract-tested.
//
// DIFFERENCE FROM deep-viz (fenced block with inline data): here the marker is only a KEY; the block
// DATA (table/verdict/PNG) is fetched FE from the DB (`analysis_result_blocks`) then joined via
// `StatsBlocksProvider`. Anti-forgery = the marker only becomes a figure when `runKey` has a REAL block.
// "Tabel n"/"Gambar n" numbers are counted by the provider at render (document order).

/** Token/element name + attribute of the stats marker (shared with the render component). */
export const STATS_VIZ_TAG = 'statsviz';
export const STATS_VIZ_RUNKEY_ATTR = 'runkey';

// LOCAL regex (not the chat-core global) so `lastIndex` state is never shared between callers.
export const STATS_MARKER_RE = /\{\{stats:([a-z0-9-]{1,64})\}\}/g;

/** One `{{stats:<runKey>}}` marker found in prose. */
export type StatsMarker = {
	start: number;
	end: number;
	raw: string;
	runKey: string;
};

/**
 * All stats markers in a text, in document order. Pure mirror of the web rehype `splitStatsMarkers`
 * extraction (which runKeys, in what order), extracted so the transform stays contract-tested
 * independent of the render library. A marker with NO real block still becomes a token (the render
 * component renders nothing) → the raw `{{stats:…}}` token never leaks to the user.
 */
export function statsMarkersInText(text: string): StatsMarker[] {
	if (!text.includes('{{stats:')) return [];
	STATS_MARKER_RE.lastIndex = 0;
	const out: StatsMarker[] = [];
	let match: RegExpExecArray | null = STATS_MARKER_RE.exec(text);
	while (match !== null) {
		out.push({
			start: match.index,
			end: match.index + match[0].length,
			raw: match[0],
			runKey: match[1]
		});
		match = STATS_MARKER_RE.exec(text);
	}
	return out;
}

import type { Extension } from 'svelte-streamdown';
import { VIZ_LANGUAGE } from '$lib/features/threads/lib/viz-markdown';

// Marked extensions that tokenize Aqsha's custom answer markers into custom tokens, rendered by the
// `Response` adapter's `children` catch-all snippet. Replaces a rehype plugin pipeline because
// svelte-streamdown is marked-based. Citations `[n]` are handled by svelte-streamdown's NATIVE
// `markedCitations` extension (rendered via the `inlineCitation` snippet), so only the stats marker +
// viz fence need custom extensions here.
//
// SECURITY: these produce OUR own token types rendered by OUR gated components — no HTML injection,
// no sanitize allowlist widening. svelte-streamdown never emits raw HTML (`renderHtml` off).

/** `aqsha-stats` inline token from a `{{stats:<runKey>}}` marker → gated `StatsVizFigure`. */
export type AqshaStatsToken = {
	type: 'aqsha-stats';
	raw: string;
	runKey: string;
};

/** `aqsha-viz` block token from a ` ```aqsha:viz ` fence → gated `DeepVizFigure`. */
export type AqshaVizToken = {
	type: 'aqsha-viz';
	raw: string;
	payload: string;
};

// Anchored at start-of-remaining-source (marked convention). Single bracketed key, sanitized alphabet.
const STATS_AT_START = /^\{\{stats:([a-z0-9-]{1,64})\}\}/;
// A fenced block ```aqsha:viz\n<payload>\n``` — info line may carry trailing chars; payload is opaque.
const VIZ_FENCE = /^```aqsha:viz[^\n]*\n([\s\S]*?)\n```(?:\n|$)/;

/** Inline extension: `{{stats:<runKey>}}` → `aqsha-stats` token. */
export const aqshaStatsExtension: Extension = {
	name: 'aqsha-stats',
	level: 'inline',
	start(src) {
		const i = src.indexOf('{{stats:');
		return i === -1 ? -1 : i;
	},
	tokenizer(src) {
		const m = STATS_AT_START.exec(src);
		if (!m) return undefined;
		return { type: 'aqsha-stats', raw: m[0], runKey: m[1] };
	}
};

/**
 * Block extension: a ` ```aqsha:viz ` fence → `aqsha-viz` token.
 * `applyInBlockParsing:true` so the fence is recognized during block splitting; runs BEFORE marked's
 * core code tokenizer, so normal ```lang fences still fall through to native Shiki highlighting.
 */
export const aqshaVizExtension: Extension = {
	name: 'aqsha-viz',
	level: 'block',
	applyInBlockParsing: true,
	start(src) {
		const i = src.indexOf('```' + VIZ_LANGUAGE);
		return i === -1 ? -1 : i;
	},
	tokenizer(src) {
		const m = VIZ_FENCE.exec(src);
		if (!m) return undefined;
		return { type: 'aqsha-viz', raw: m[0], payload: (m[1] ?? '').trim() };
	}
};

/** The full custom-extension set passed to `<Streamdown extensions={...}>` for report answers. */
export const aqshaMarkdownExtensions: Extension[] = [aqshaStatsExtension, aqshaVizExtension];

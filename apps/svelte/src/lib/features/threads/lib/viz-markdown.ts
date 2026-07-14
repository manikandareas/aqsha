// Detection of the fenced block ` ```aqsha:viz ` (the `/deep` report evidence-viz JSON, injected by
// `injectVizBlocks` in the agent) → the `<deepviz>` custom render gated by `VizFigureProvider`.
//
// ── DIVERGENCE FROM WEB (rehype → marked) ────────────────────────────────────────────────────────
// Web finds `pre > code.language-aqsha:viz` in the sanitized HAST and swaps it for a `<deepviz>` element
// (so Streamdown's `code` plugin never highlights it). svelte-streamdown is marked-based: a fenced code
// block arrives as a `code` token with `token.lang === 'aqsha:viz'` and `token.text` = the JSON payload.
// `apps/svelte` registers a marked BLOCK extension (`aqshaVizExtension`, in the Streamdown adapter) that
// matches this fence BEFORE the core code tokenizer, producing a custom token rendered by the `children`
// catch-all → `DeepVizFigure` (gated). Normal fences (```python) still fall through to native Shiki code.
// The pure fence/payload helpers stay here, contract-tested.
//
// "Gambar n" is NOT counted here: the chat-core injector already stamps `figure` in the payload per
// final document order (svelte-streamdown renders markdown per block, so a plugin counter can't see
// cross-block order).

/** Token/element name + attribute of the viz block (shared with the render component). */
export const DEEP_VIZ_TAG = 'deepviz';
export const DEEP_VIZ_PAYLOAD_ATTR = 'payload';

/** Fence info string the agent writes for an evidence-viz block. */
export const VIZ_LANGUAGE = 'aqsha:viz';

/** `language-aqsha:viz` class (web HAST form) — kept for parity of the class-based matcher. */
export const VIZ_LANGUAGE_CLASS = 'language-aqsha:viz';

/** Is this fenced-code info string the viz language? (marked passes `token.lang`.) */
export function isVizFence(lang: unknown): boolean {
	return typeof lang === 'string' && lang.trim() === VIZ_LANGUAGE;
}

/**
 * Extract the viz payload string from a fenced code token: the trimmed body when `lang === 'aqsha:viz'`,
 * else null (leave the block as normal code). Mirror of web `vizElementFromPre`/`codeText` (which
 * joined the code text nodes and trimmed), adapted to marked's `{lang, text}` code token. The payload
 * is validated downstream by the chat-core zod contract (`parseDeepVizBlock`) — this is a pure extract.
 */
export function vizPayloadFromCode(lang: unknown, text: unknown): string | null {
	if (!isVizFence(lang)) return null;
	return typeof text === 'string' ? text.trim() : '';
}

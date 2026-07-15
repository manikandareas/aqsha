// Thread-detail right-panel mode (clickable message-part detail panels).
//
// The codec is PURE and wired to the URL via SvelteKit navigation (`page.url.searchParams` + `goto`) in
// `thread-panel-context.svelte.ts`. Serialize/parse must stay stable so the `panel` query param
// round-trips on deep links (pinned by `thread-panel-model.spec.ts`).
//
// The thread-detail shell has ONE side-panel slot behind a tab strip (Workspace · Sumber · Statistik ·
// Pratinjau). Every mode maps to one tab (`threadPanelTabOf`); the message-part detail modes share the
// single Pratinjau slot. Mode lives in the URL (one `panel` query param) so panels are deep-linkable.

export type ThreadPanelMode =
	| { kind: 'closed' }
	| { kind: 'context' }
	| { kind: 'artifact'; artifactId: string }
	| { kind: 'sources'; messageId?: string }
	| { kind: 'stats'; runKey?: string }
	| { kind: 'search'; turnId: string; subQuestionIndex: number }
	| { kind: 'step'; toolCallId: string }
	| { kind: 'plan'; turnId: string }
	| { kind: 'questions' };

export const CLOSED_PANEL: ThreadPanelMode = { kind: 'closed' };

/** Sentinel run id for the live `/deep` plan gate (no persisted report/runId yet on the FE). */
export const LIVE_PLAN_KEY = '__live__';

export function isThreadPanelOpen(mode: ThreadPanelMode): boolean {
	return mode.kind !== 'closed';
}

/** The side panel's tab strip entries — every open mode belongs to exactly one. */
export type ThreadPanelTab = 'workspace' | 'sources' | 'statistics' | 'preview';

/** Message-part detail modes share the single Pratinjau (preview) slot. */
export function isThreadPanelPreviewMode(mode: ThreadPanelMode): boolean {
	return (
		mode.kind === 'artifact' ||
		mode.kind === 'search' ||
		mode.kind === 'step' ||
		mode.kind === 'plan' ||
		mode.kind === 'questions'
	);
}

/** Which tab an open mode lives under (`null` when the panel is closed). */
export function threadPanelTabOf(mode: ThreadPanelMode): ThreadPanelTab | null {
	if (mode.kind === 'closed') return null;
	if (mode.kind === 'context') return 'workspace';
	if (mode.kind === 'sources') return 'sources';
	if (mode.kind === 'stats') return 'statistics';
	return 'preview';
}

// URL encoding for the single `panel` query param. Closed = param absent.
//   context → "c" · plan → "p:<turnId>" · artifact → "a:<id>"
//   sources → "m" (aggregate) / "m:<messageId>" · stats → "s" / "s:<runKey>"
//   search → "q:<turnId>:<index>" · step → "t:<toolCallId>" · questions → "x"
// Id-bearing modes split on the FIRST ":"; `search` keeps the trailing numeric index after the LAST ":".
export function serializeThreadPanelMode(mode: ThreadPanelMode): string | null {
	switch (mode.kind) {
		case 'context':
			return 'c';
		case 'plan':
			return `p:${mode.turnId}`;
		case 'artifact':
			return `a:${mode.artifactId}`;
		case 'sources':
			return mode.messageId ? `m:${mode.messageId}` : 'm';
		case 'stats':
			return mode.runKey ? `s:${mode.runKey}` : 's';
		case 'search':
			return `q:${mode.turnId}:${mode.subQuestionIndex}`;
		case 'step':
			return `t:${mode.toolCallId}`;
		case 'questions':
			return 'x';
		case 'closed':
			return null;
	}
}

export function parseThreadPanelMode(raw: string): ThreadPanelMode {
	if (raw === 'c') return { kind: 'context' };
	if (raw === 'x') return { kind: 'questions' };
	if (raw === 'm') return { kind: 'sources' };
	if (raw === 's') return { kind: 'stats' };
	if (raw.startsWith('p:')) {
		const turnId = raw.slice(2);
		return turnId ? { kind: 'plan', turnId } : CLOSED_PANEL;
	}
	if (raw.startsWith('a:')) {
		const id = raw.slice(2);
		return id ? { kind: 'artifact', artifactId: id } : CLOSED_PANEL;
	}
	if (raw.startsWith('m:')) {
		const id = raw.slice(2);
		return id ? { kind: 'sources', messageId: id } : { kind: 'sources' };
	}
	if (raw.startsWith('s:')) {
		const runKey = raw.slice(2);
		return runKey ? { kind: 'stats', runKey } : { kind: 'stats' };
	}
	if (raw.startsWith('t:')) {
		const id = raw.slice(2);
		return id ? { kind: 'step', toolCallId: id } : CLOSED_PANEL;
	}
	if (raw.startsWith('q:')) {
		const rest = raw.slice(2);
		const sep = rest.lastIndexOf(':');
		if (sep <= 0) return CLOSED_PANEL;
		const turnId = rest.slice(0, sep);
		const idxRaw = rest.slice(sep + 1);
		// Strict digits only — reject "", "1e3", "0x5", " 1" (Number() would coerce those).
		if (!turnId || !/^\d+$/.test(idxRaw)) return CLOSED_PANEL;
		return { kind: 'search', turnId, subQuestionIndex: Number.parseInt(idxRaw, 10) };
	}
	return CLOSED_PANEL;
}

/**
 * Parse the raw `panel` query param into a mode (absent/invalid → closed). Pairs with
 * `panelParamFor` for wiring to `page.url.searchParams`.
 */
export function panelModeFromParam(raw: string | null | undefined): ThreadPanelMode {
	if (raw == null || raw === '') return CLOSED_PANEL;
	return parseThreadPanelMode(raw);
}

/** The `panel` query-param value for a mode (`null` = remove the param). */
export function panelParamFor(mode: ThreadPanelMode): string | null {
	return serializeThreadPanelMode(mode);
}

import { goto } from '$app/navigation';
import { page } from '$app/state';
import { createContext } from '$lib/context';
import {
	EMPTY_THREAD_PANEL_LOOKUPS,
	type ThreadPanelLookups
} from '$lib/features/threads/lib/thread-panel-data';
import {
	panelModeFromParam,
	panelParamFor,
	type ThreadPanelMode
} from '../utils/thread-panel-model';

/**
 * Thread-detail side-panel controller (Svelte port of `thread-panel-context.tsx` +
 * `useRegisterThreadPanelData`). The open mode lives in the URL (`?panel=` query param) so panels are
 * deep-linkable and survive refresh; the codec is `thread-panel-model.ts` (byte-equivalent with web).
 * `mode` derives reactively from `page.url` (SvelteKit `$app/state`); openers navigate via `goto`
 * (preserving the rest of the URL). The surface registers id-keyed detail lookups here. A per-tree
 * class via `createContext` (§3.5 — never a module singleton). Null outside the full shell (compact
 * panels) → in-message cards keep their default behaviour.
 */
export class ThreadPanelController {
	#lookups = $state<ThreadPanelLookups>(EMPTY_THREAD_PANEL_LOOKUPS);

	/** Current panel mode, derived from the `?panel=` URL param. */
	get mode(): ThreadPanelMode {
		return panelModeFromParam(page.url.searchParams.get('panel'));
	}

	get lookups(): ThreadPanelLookups {
		return this.#lookups;
	}

	/** The surface publishes freshly-built id-keyed lookups every time its inputs change. */
	register(lookups: ThreadPanelLookups): void {
		this.#lookups = lookups;
	}

	#setMode(mode: ThreadPanelMode): void {
		const param = panelParamFor(mode);
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient URL builder, not reactive state
		const url = new URL(page.url);
		if (param === null) url.searchParams.delete('panel');
		else url.searchParams.set('panel', param);
		// Same-page query change (the `?panel=` codec) — resolve() models internal route ids, not a URL
		// object with an edited search param.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(url, { replaceState: false, noScroll: true, keepFocus: true });
	}

	openContextPanel(): void {
		this.#setMode({ kind: 'context' });
	}
	openArtifactPanel(artifactId: string): void {
		this.#setMode({ kind: 'artifact', artifactId });
	}
	openSourcesPanel(messageId?: string): void {
		this.#setMode({ kind: 'sources', ...(messageId ? { messageId } : {}) });
	}
	openSearchPanel(turnId: string, subQuestionIndex: number): void {
		this.#setMode({ kind: 'search', turnId, subQuestionIndex });
	}
	openStepPanel(toolCallId: string): void {
		this.#setMode({ kind: 'step', toolCallId });
	}
	openPlanPanel(turnId: string): void {
		this.#setMode({ kind: 'plan', turnId });
	}
	openStatsPanel(runKey?: string): void {
		this.#setMode({ kind: 'stats', ...(runKey ? { runKey } : {}) });
	}
	openQuestionsPanel(): void {
		this.#setMode({ kind: 'questions' });
	}
	close(): void {
		this.#setMode({ kind: 'closed' });
	}
}

const threadPanelContext = createContext<ThreadPanelController>('thread-panel');

export const setThreadPanel = (controller: ThreadPanelController): ThreadPanelController =>
	threadPanelContext.set(controller);

/** Read the panel controller. Returns `undefined` in compact panels (no shell) — callers guard. */
export function getThreadPanel(): ThreadPanelController | undefined {
	return threadPanelContext.getOptional();
}

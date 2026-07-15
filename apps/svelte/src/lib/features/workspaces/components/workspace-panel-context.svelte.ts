import { goto } from '$app/navigation';
import { page } from '$app/state';
import { createContext } from '$lib/context';
import {
	CLOSED_WORKSPACE_PANEL,
	isWorkspacePanelOpen,
	parseWorkspacePanelMode,
	serializeWorkspacePanelMode,
	type WorkspacePanelMode
} from '../utils/workspace-panel-model';

/**
 * Workspace-detail right-panel controller. Open mode lives in the URL (`?panel=` query param, codec
 * `workspace-panel-model.ts`) so tabs + citation detail are deep-linkable and survive refresh. `mode`
 * derives reactively from `page.url`; openers navigate via `goto` (history replace). `setOpen(true)`
 * restores the last open mode (default chat). Per-tree class via `createContext` (never a module singleton).
 */
export class WorkspacePanelController {
	// Last open mode set within this mount — target of the next `setOpen(true)` (default chat).
	#lastOpen: WorkspacePanelMode = { kind: 'chat' };

	get mode(): WorkspacePanelMode {
		const raw = page.url.searchParams.get('panel');
		return raw ? parseWorkspacePanelMode(raw) : CLOSED_WORKSPACE_PANEL;
	}

	get isOpen(): boolean {
		return isWorkspacePanelOpen(this.mode);
	}

	#setMode(next: WorkspacePanelMode): void {
		if (isWorkspacePanelOpen(next)) this.#lastOpen = next;
		const param = serializeWorkspacePanelMode(next);
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient URL builder, not reactive state
		const url = new URL(page.url);
		if (param === null) url.searchParams.delete('panel');
		else url.searchParams.set('panel', param);
		// Same-page query change (`?panel=` codec) — resolve() models route ids, not an edited search.

		void goto(url, { replaceState: true, noScroll: true, keepFocus: true });
	}

	openChat(): void {
		this.#setMode({ kind: 'chat' });
	}
	openCitations(): void {
		this.#setMode({ kind: 'citations' });
	}
	openCitationDetail(citationId: string): void {
		this.#setMode({ kind: 'citations', citationId });
	}
	closePanel(): void {
		this.#setMode(CLOSED_WORKSPACE_PANEL);
	}
	/** Used by `DetailSplitLayout.onSideOpenChange`; open = last remembered mode (default chat). */
	setOpen(open: boolean): void {
		this.#setMode(open ? this.#lastOpen : CLOSED_WORKSPACE_PANEL);
	}
}

const workspacePanelContext = createContext<WorkspacePanelController>('workspace-panel');

export const setWorkspacePanel = (controller: WorkspacePanelController): WorkspacePanelController =>
	workspacePanelContext.set(controller);

export function getWorkspacePanel(): WorkspacePanelController {
	return workspacePanelContext.get();
}

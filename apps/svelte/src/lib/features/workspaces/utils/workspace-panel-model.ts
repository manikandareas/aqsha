// Workspace-detail right-panel mode (tab strip `Chat · Sitasi`).
//
// Analog thread-panel-model tetapi jauh lebih sederhana: dua tab, satu sub-view.
// Mode hidup di URL (satu query param `panel`) supaya tab Sitasi dan detail
// sitasi deep-linkable (`?panel=cite` / `?panel=cite:<citationId>`) dan tahan refresh.
// Param absen = panel tertutup (menggantikan state lokal `chatPanelOpen`).
//
// Port svelte: codec PURE (serialize/parse), di-wire lewat SvelteKit `page.url`/
// `goto` (padanan thread-panel-model THX-6). Parser nuqs web dihapus (§2.3 phase7).

export type WorkspacePanelMode =
	{ kind: 'closed' } | { kind: 'chat' } | { kind: 'citations'; citationId?: string };

export const CLOSED_WORKSPACE_PANEL: WorkspacePanelMode = { kind: 'closed' };

export function isWorkspacePanelOpen(mode: WorkspacePanelMode): boolean {
	return mode.kind !== 'closed';
}

export type WorkspacePanelTab = 'chat' | 'citations';

/** Tab strip milik mode terbuka (`null` saat panel tertutup). */
export function workspacePanelTabOf(mode: WorkspacePanelMode): WorkspacePanelTab | null {
	if (mode.kind === 'closed') return null;
	return mode.kind;
}

// URL encoding param `panel`: `chat` → tab Chat; `cite` → tab Sitasi (list);
// `cite:<citationId>` → sub-view detail sitasi. Split pada ":" PERTAMA supaya id
// yang mengandung ":" round-trip utuh.
export function serializeWorkspacePanelMode(mode: WorkspacePanelMode): string | null {
	switch (mode.kind) {
		case 'chat':
			return 'chat';
		case 'citations':
			return mode.citationId ? `cite:${mode.citationId}` : 'cite';
		case 'closed':
			return null;
	}
}

export function parseWorkspacePanelMode(raw: string): WorkspacePanelMode {
	if (raw === 'chat') return { kind: 'chat' };
	if (raw === 'cite') return { kind: 'citations' };
	if (raw.startsWith('cite:')) {
		const citationId = raw.slice('cite:'.length);
		// Id kosong ("cite:", link terpotong) dibaca sebagai list Sitasi.
		return citationId ? { kind: 'citations', citationId } : { kind: 'citations' };
	}
	return CLOSED_WORKSPACE_PANEL;
}

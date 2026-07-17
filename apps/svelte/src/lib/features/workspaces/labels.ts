import type { SectionStatus, WorkspaceKind, WorkspaceSection, WorkspaceStage } from './types';

// Mapping enum DB (bahasa Inggris) → label UI bahasa Indonesia, sentence case.

export const WORKSPACE_KIND_LABELS: Record<WorkspaceKind, string> = {
	undergraduate_thesis: 'skripsi',
	masters_thesis: 'tesis',
	dissertation: 'disertasi',
	journal_article: 'artikel jurnal',
	proposal: 'proposal',
	paper: 'makalah',
	freeform: 'bebas'
};

export const WORKSPACE_STAGE_LABELS: Record<WorkspaceStage, string> = {
	exploration: 'eksplorasi',
	proposal: 'proposal',
	research: 'riset',
	writing: 'penulisan',
	revision: 'revisi',
	done: 'selesai'
};

export const SECTION_STATUS_LABELS: Record<SectionStatus, string> = {
	empty: 'kosong',
	draft: 'draf',
	in_review: 'direview',
	done: 'beres'
};

const DEADLINE_FORMAT = new Intl.DateTimeFormat('id-ID', {
	day: 'numeric',
	month: 'short',
	year: 'numeric'
});

export function formatDeadline(ms: number): string {
	return DEADLINE_FORMAT.format(ms);
}

/**
 * Progress kerangka: bab `done` / total, tanpa section bibliography (kontennya
 * digenerate, bukan ditulis user).
 */
export function sectionProgress(sections: readonly WorkspaceSection[]): {
	done: number;
	total: number;
} {
	const writable = sections.filter((s) => s.role !== 'bibliography');
	return {
		done: writable.filter((s) => s.status === 'done').length,
		total: writable.length
	};
}

const RELATIVE_FORMAT = new Intl.RelativeTimeFormat('id-ID', { numeric: 'auto' });

export function formatRelativeToNow(ms: number): string {
	const deltaMs = ms - Date.now();
	const dayMs = 86_400_000;
	if (Math.abs(deltaMs) >= dayMs) return RELATIVE_FORMAT.format(Math.round(deltaMs / dayMs), 'day');
	if (Math.abs(deltaMs) >= 3_600_000)
		return RELATIVE_FORMAT.format(Math.round(deltaMs / 3_600_000), 'hour');
	return RELATIVE_FORMAT.format(Math.round(deltaMs / 60_000), 'minute');
}

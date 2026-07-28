import type { WorkspaceKind, WorkspaceKindInfoField } from './types';

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

export const WORKSPACE_KIND_DESCRIPTIONS: Record<WorkspaceKind, string> = {
	undergraduate_thesis: 'Karya tulis akhir sarjana dengan halaman judul institusi.',
	masters_thesis: 'Tesis magister dengan halaman judul institusi.',
	dissertation: 'Disertasi doktoral dengan halaman judul institusi.',
	journal_article: 'Naskah untuk pengiriman ke jurnal (struktur IMRaD).',
	proposal: 'Proposal penelitian dengan halaman judul institusi.',
	paper: 'Makalah tugas kuliah atau seminar.',
	freeform: 'Dokumen bebas tanpa kerangka khusus.'
};

/** Label + placeholder untuk tiap field kind_info (form create + sheet detail). */
export const KIND_INFO_FIELD_LABELS: Record<WorkspaceKindInfoField, string> = {
	university: 'Universitas',
	faculty: 'Fakultas',
	studyProgram: 'Program studi',
	targetJournal: 'Jurnal tujuan',
	affiliation: 'Afiliasi',
	courseOrVenue: 'Mata kuliah / forum'
};

export const KIND_INFO_FIELD_PLACEHOLDERS: Record<WorkspaceKindInfoField, string> = {
	university: 'cth. Universitas Indonesia',
	faculty: 'cth. Fakultas Ilmu Komputer',
	studyProgram: 'cth. Ilmu Komputer',
	targetJournal: 'cth. Jurnal Sistem Informasi',
	affiliation: 'cth. Lab. Sistem Cerdas, UI',
	courseOrVenue: 'cth. Metodologi Penelitian'
};

const DEADLINE_FORMAT = new Intl.DateTimeFormat('id-ID', {
	day: 'numeric',
	month: 'short',
	year: 'numeric'
});

export function formatDeadline(ms: number): string {
	return DEADLINE_FORMAT.format(ms);
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

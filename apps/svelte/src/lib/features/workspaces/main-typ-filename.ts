import { WORKSPACE_KINDS, type WorkspaceKind } from './types';

/**
 * Basename berkas utama Typst per kind proyek (label ID, slug). `freeform` tetap `main.typ`.
 * Paritas dengan `packages/services/src/typst/main-filename.ts` (client tak boleh import services/db).
 */
export const MAIN_TYP_FILENAMES = {
	undergraduate_thesis: 'skripsi.typ',
	masters_thesis: 'tesis.typ',
	dissertation: 'disertasi.typ',
	journal_article: 'artikel-jurnal.typ',
	proposal: 'proposal.typ',
	paper: 'makalah.typ',
	freeform: 'main.typ'
} as const satisfies Record<WorkspaceKind, string>;

export function mainTypFilename(kind: WorkspaceKind): string {
	return MAIN_TYP_FILENAMES[kind];
}

/** Resolve aman dari kind string / unknown — unknown → `main.typ`. */
export function resolveMainTypFilename(kind: string | null | undefined): string {
	if (kind && (WORKSPACE_KINDS as readonly string[]).includes(kind)) {
		return MAIN_TYP_FILENAMES[kind as WorkspaceKind];
	}
	return MAIN_TYP_FILENAMES.freeform;
}

/** Path virtual compiler/editor, mis. `/skripsi.typ`. */
export function mainTypFilePath(kind: WorkspaceKind): string {
	return `/${mainTypFilename(kind)}`;
}

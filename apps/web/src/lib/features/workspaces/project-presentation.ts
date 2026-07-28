import type { WorkspaceKind } from './types';

export type ProjectAccent = 'mint' | 'lavender' | 'coral' | 'lemon';

const PROJECT_ACCENTS = {
	undergraduate_thesis: 'mint',
	masters_thesis: 'lavender',
	dissertation: 'coral',
	journal_article: 'lavender',
	proposal: 'coral',
	paper: 'lemon',
	freeform: 'mint'
} as const satisfies Record<WorkspaceKind, ProjectAccent>;

export function projectAccent(kind: WorkspaceKind): ProjectAccent {
	return PROJECT_ACCENTS[kind];
}

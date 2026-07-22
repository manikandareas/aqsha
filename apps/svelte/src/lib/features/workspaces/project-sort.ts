import { projectDisplayTitle, type Workspace } from './types';

export type ProjectSortId = 'updated-desc' | 'name-asc' | 'created-desc' | 'updated-asc';

export const PROJECT_SORT_OPTIONS = [
	{ id: 'updated-desc', label: 'Terbaru diedit' },
	{ id: 'name-asc', label: 'A–Z' },
	{ id: 'created-desc', label: 'Terbaru dibuat' },
	{ id: 'updated-asc', label: 'Terlama diedit' }
] as const satisfies readonly { id: ProjectSortId; label: string }[];

export function sortWorkspaces(items: Workspace[], sort: ProjectSortId): Workspace[] {
	const next = [...items];
	const byTitle = (a: Workspace, b: Workspace) =>
		projectDisplayTitle(a).localeCompare(projectDisplayTitle(b), 'id', { sensitivity: 'base' });

	switch (sort) {
		case 'name-asc':
			return next.sort(byTitle);
		case 'updated-desc':
			return next.sort((a, b) => b.updatedAt - a.updatedAt);
		case 'updated-asc':
			return next.sort((a, b) => a.updatedAt - b.updatedAt);
		case 'created-desc':
			return next.sort((a, b) => b.createdAt - a.createdAt);
		default: {
			const _exhaustive: never = sort;
			return _exhaustive;
		}
	}
}

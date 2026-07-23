import { resolve } from '$app/paths';

export type LibraryScope =
	{ kind: 'global' } | { kind: 'project'; workspaceId: string; workspaceName: string };

export function libraryBasePath(scope: LibraryScope): string {
	if (scope.kind === 'global') return resolve('/app/(product)/library');
	return resolve('/app/(product)/projects/[projectId]/references', {
		projectId: scope.workspaceId
	});
}

export function libraryWorkspaceId(scope: LibraryScope): string | null {
	return scope.kind === 'project' ? scope.workspaceId : null;
}

export function libraryTitle(scope: LibraryScope): string {
	if (scope.kind === 'global') return 'Perpustakaan';
	return `Perpustakaan / ${scope.workspaceName}`;
}

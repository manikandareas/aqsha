export type LibraryScope =
	| { kind: 'global' }
	| { kind: 'project'; workspaceId: string; workspaceName: string };

export function libraryBasePath(scope: LibraryScope): string {
	if (scope.kind === 'global') return '/app/library';
	return `/app/projects/${encodeURIComponent(scope.workspaceId)}/references`;
}

export function libraryWorkspaceId(scope: LibraryScope): string | null {
	return scope.kind === 'project' ? scope.workspaceId : null;
}

export function libraryTitle(scope: LibraryScope): string {
	if (scope.kind === 'global') return 'Perpustakaan';
	return `Perpustakaan / ${scope.workspaceName}`;
}

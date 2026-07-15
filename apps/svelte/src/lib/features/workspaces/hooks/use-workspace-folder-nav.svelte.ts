import { goto } from '$app/navigation';
import { page } from '$app/state';
import { resolveActiveFolderId, type ArtifactGroup } from '../utils/workspace-library-model';

/**
 * Folder navigation. The active folder lives in the URL `folder` query param (default `root` → param
 * omitted); `activeFolderId` resolves against the current groups (falls back to root for unknown ids).
 * Navigation is a same-page query change via `goto` (history replace, no scroll, keep focus).
 */
export function createWorkspaceFolderNav(getGroups: () => ArtifactGroup[]) {
	function setFolderParam(folderId: 'root' | string) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient URL builder, not reactive state
		const url = new URL(page.url);
		if (folderId === 'root') url.searchParams.delete('folder');
		else url.searchParams.set('folder', folderId);

		void goto(url, { replaceState: true, noScroll: true, keepFocus: true });
	}

	return {
		get activeFolderId(): 'root' | string {
			const param = page.url.searchParams.get('folder') ?? 'root';
			return resolveActiveFolderId({ activeFolderId: param, groups: getGroups() });
		},
		openFolder: (folderId: string) => setFolderParam(folderId),
		navigateTo: (folderId: 'root' | string) => setFolderParam(folderId)
	};
}

import type { WorkspaceArtifact, WorkspaceFolder } from '../utils/workspace-library-model';

/**
 * Library dialog state. A `$state`-backed class (per-tree, never module singleton) holding the open
 * flags + rename/delete targets, plus the `libraryHandlers` bag the board spreads onto the grid/context menus.
 */
export class WorkspaceLibraryDialogState {
	archiveWorkspaceOpen = $state(false);
	createFolderOpen = $state(false);
	createDocumentOpen = $state(false);
	createUrlOpen = $state(false);
	renameFolder = $state<WorkspaceFolder | null>(null);
	deleteFolder = $state<WorkspaceFolder | null>(null);
	renameArtifact = $state<WorkspaceArtifact | null>(null);
	deleteArtifact = $state<WorkspaceArtifact | null>(null);

	readonly libraryHandlers = {
		onRenameFolder: (folder: WorkspaceFolder) => {
			this.renameFolder = folder;
		},
		onDeleteFolder: (folder: WorkspaceFolder) => {
			this.deleteFolder = folder;
		},
		onRenameArtifact: (artifact: WorkspaceArtifact) => {
			this.renameArtifact = artifact;
		},
		onDeleteArtifact: (artifact: WorkspaceArtifact) => {
			this.deleteArtifact = artifact;
		},
		onCreateFolder: () => {
			this.createFolderOpen = true;
		},
		onCreateDocument: () => {
			this.createDocumentOpen = true;
		},
		onCreateUrl: () => {
			this.createUrlOpen = true;
		},
		onArchiveWorkspace: () => {
			this.archiveWorkspaceOpen = true;
		}
	};
}

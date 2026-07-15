<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import NameDialog from './NameDialog.svelte';
	import AddItemDialog from './AddItemDialog.svelte';
	import type { WorkspaceLibraryDialogState } from '../hooks/use-workspace-library-dialogs.svelte';

	/**
	 * The library dialog stack — port `workspace-library-dialogs-stack.tsx`. Renders create/rename/delete
	 * folder + artifact dialogs + archive-workspace confirm, driven by the shared `WorkspaceLibraryDialogState`
	 * class. Created documents navigate to the artifact reader route.
	 */
	export type WorkspaceLibraryMutations = {
		archiveWorkspace: (args: { workspaceId: string }) => Promise<unknown>;
		createFolder: (args: { workspaceId: string; name: string }) => Promise<unknown>;
		createDocument: (args: {
			workspaceId: string;
			folderId?: string;
			title: string;
		}) => Promise<unknown>;
		createUrl: (args: {
			workspaceId: string;
			folderId?: string;
			url: string;
			title?: string;
		}) => Promise<unknown>;
		renameFolder: (args: { folderId: string; name: string }) => Promise<unknown>;
		renameArtifact: (args: { artifactId: string; title: string }) => Promise<unknown>;
		removeFolder: (args: { folderId: string }) => Promise<unknown>;
		removeArtifact: (args: { artifactId: string }) => Promise<unknown>;
	};

	let {
		workspaceId,
		activeFolderId,
		activeFolderName,
		mutations,
		dialogState,
		onAfterArchive,
		onUploadFiles
	}: {
		workspaceId: string;
		activeFolderId: 'root' | string;
		activeFolderName?: string;
		mutations: WorkspaceLibraryMutations;
		dialogState: WorkspaceLibraryDialogState;
		onAfterArchive?: () => void;
		onUploadFiles: (files: File[]) => void;
	} = $props();

	const folderIdForCreate = $derived(activeFolderId === 'root' ? undefined : activeFolderId);

	function openCreatedArtifact(artifactId: unknown) {
		void goto(
			resolve('/app/(product)/workspaces/[workspaceId]/artifacts/[artifactId]', {
				workspaceId,
				artifactId: String(artifactId)
			})
		);
	}
</script>

<NameDialog
	open={dialogState.createFolderOpen}
	onOpenChange={(open) => (dialogState.createFolderOpen = open)}
	title="Folder baru"
	description="Buat folder satu level."
	submitLabel="Buat"
	onSubmit={async ({ name }) => {
		await mutations.createFolder({ workspaceId, name });
	}}
/>
<NameDialog
	open={dialogState.createDocumentOpen}
	onOpenChange={(open) => (dialogState.createDocumentOpen = open)}
	title="Dokumen baru"
	description="Buat placeholder dokumen."
	submitLabel="Buat"
	onSubmit={async ({ name }) => {
		const artifactId = await mutations.createDocument({
			workspaceId,
			folderId: folderIdForCreate,
			title: name
		});
		openCreatedArtifact(artifactId);
	}}
/>
<AddItemDialog
	open={dialogState.createUrlOpen}
	folderName={activeFolderName}
	onOpenChange={(open) => (dialogState.createUrlOpen = open)}
	{onUploadFiles}
	onSubmit={async ({ url, title }) => {
		await mutations.createUrl({
			workspaceId,
			folderId: folderIdForCreate,
			url,
			title: title?.trim() || undefined
		});
	}}
/>
<NameDialog
	open={Boolean(dialogState.renameFolder)}
	onOpenChange={(open) => {
		if (!open) dialogState.renameFolder = null;
	}}
	title="Rename folder"
	description="Perbarui nama folder."
	submitLabel="Simpan"
	initialName={dialogState.renameFolder?.name ?? ''}
	onSubmit={async ({ name }) => {
		if (dialogState.renameFolder) {
			await mutations.renameFolder({ folderId: dialogState.renameFolder._id, name });
		}
	}}
/>
<NameDialog
	open={Boolean(dialogState.renameArtifact)}
	onOpenChange={(open) => {
		if (!open) dialogState.renameArtifact = null;
	}}
	title="Rename artifact"
	description="Perbarui judul artifact."
	submitLabel="Simpan"
	initialName={dialogState.renameArtifact?.title ?? ''}
	onSubmit={async ({ name }) => {
		if (dialogState.renameArtifact) {
			await mutations.renameArtifact({ artifactId: dialogState.renameArtifact._id, title: name });
		}
	}}
/>
<ConfirmDialog
	open={dialogState.archiveWorkspaceOpen}
	onOpenChange={(open) => (dialogState.archiveWorkspaceOpen = open)}
	title="Archive workspace"
	description="Workspace ini disembunyikan dari daftar aktif."
	confirmLabel="Archive"
	onConfirm={async () => {
		await mutations.archiveWorkspace({ workspaceId });
		onAfterArchive?.();
	}}
/>
<ConfirmDialog
	open={Boolean(dialogState.deleteFolder)}
	onOpenChange={(open) => {
		if (!open) dialogState.deleteFolder = null;
	}}
	title="Delete folder"
	description="Artifact aktif di folder ini akan kembali ke tingkat Semua file."
	confirmLabel="Delete"
	onConfirm={async () => {
		if (dialogState.deleteFolder) {
			await mutations.removeFolder({ folderId: dialogState.deleteFolder._id });
		}
	}}
/>
<ConfirmDialog
	open={Boolean(dialogState.deleteArtifact)}
	onOpenChange={(open) => {
		if (!open) dialogState.deleteArtifact = null;
	}}
	title="Delete artifact"
	description="Artifact ini disembunyikan dari library."
	confirmLabel="Delete"
	onConfirm={async () => {
		if (dialogState.deleteArtifact) {
			await mutations.removeArtifact({ artifactId: dialogState.deleteArtifact._id });
		}
	}}
/>

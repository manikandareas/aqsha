import { getAuthState } from '$lib/auth/context.svelte';
import { useProfile } from '$lib/features/settings/api';
import {
	useDeleteThread,
	usePinnedThreads,
	usePinThread,
	useSendStatus,
	useThreadsList
} from '$lib/features/threads/api';
import {
	useArtifact,
	useArtifactRender,
	useArtifacts,
	useCreateDocument,
	useDeleteArtifact,
	useMoveArtifact,
	useRenameArtifact,
	useRetryUrlExtraction,
	useSaveUrl,
	useUpdateDocument,
	useUploadArtifact
} from '$lib/features/artifacts/api';
import {
	useArchiveWorkspace,
	useCreateFolder,
	useCreateWorkspace,
	useDeleteFolder,
	useFolders,
	useMoveFolder,
	useRenameFolder,
	useUpdateWorkspace,
	useWorkspace,
	useWorkspacesList
} from '../api';
import type { WorkspaceArtifact } from '../utils/workspace-library-model';

/**
 * Composite workspace data hooks — Svelte port of `apps/web/features/workspaces/api/
 * use-workspaces-data.ts`. React recomputes the return object each render; here we return objects with
 * **getter** properties so accessing `.workspaces`/`.threads`/`.artifacts` re-reads the underlying
 * reactive svelte-query state (§3.5/§3.6). Mutations are exposed as plain async functions.
 *
 * Call these during component init (they call query/api-client context internally). Reactive `workspaceId`/
 * `artifactId` inputs flow as getters into the leaf hooks.
 */

function flattenWorkspaces(
	pages:
		| Array<{
				items: Array<{
					id: string;
					name: string;
					emoji: string | null;
					updatedAt: number;
				}>;
		  }>
		| undefined
) {
	return (pages ?? []).flatMap((page) =>
		page.items.map((workspace) => ({
			_id: workspace.id,
			name: workspace.name,
			emoji: workspace.emoji ?? undefined,
			updatedAt: workspace.updatedAt
		}))
	);
}

function flattenThreads(
	pages:
		| Array<{
				items: Array<{
					id: string;
					title: string | null;
					lastActivityAt: number;
					lastMessagePreview: string | null;
					status: string;
					agentKind: string;
					createdAt: number;
					workspaceId?: string | null;
					pinnedAt?: number | null;
					bucket?: 'recent' | 'older';
				}>;
		  }>
		| undefined
) {
	return (pages ?? []).flatMap((page) =>
		page.items.map((thread) => ({
			threadId: thread.id,
			title: thread.title?.trim() ? thread.title : 'Percakapan baru',
			createdAt: thread.createdAt,
			lastActivityAt: thread.lastActivityAt,
			lastMessagePreview: thread.lastMessagePreview ?? '',
			messageCount: 0,
			status: thread.status as 'idle' | 'streaming' | 'failed',
			lastAgentKind: thread.agentKind as 'lite' | 'pro' | undefined,
			workspaceId: thread.workspaceId ?? undefined,
			pinnedAt: thread.pinnedAt ?? null,
			bucket: thread.bucket
		}))
	);
}

export type SidebarThread = ReturnType<typeof flattenThreads>[number];
export type SidebarWorkspace = ReturnType<typeof flattenWorkspaces>[number];

function flattenArtifacts(
	pages:
		| Array<{
				items: Array<{
					_id: string;
					title: string;
					artifactType: string;
					artifactFamily?: string | null;
					// `source` membedakan output agent vs library — wajib di-carry, kalau
					// tidak SEMUA artifak jatuh ke kategori library (tab Artifact kosong).
					source?: string | null;
					workspaceId: string | null;
					folderId: string | null;
					createdAt: number;
					updatedAt: number;
					mimeType?: string | null;
					url?: string | null;
					indexingStatus?: string | null;
					indexingFailureReason?: string | null;
					plainTextPreview?: string | null;
					status?: string | null;
					detectedDocumentKind?: string | null;
				}>;
		  }>
		| undefined
) {
	return (pages ?? []).flatMap((page) =>
		page.items.map((artifact) => ({
			_id: artifact._id,
			title: artifact.title,
			kind: artifact.artifactType,
			artifactType: artifact.artifactType,
			artifactFamily: artifact.artifactFamily ?? undefined,
			source: artifact.source ?? undefined,
			detectedDocumentKind: artifact.detectedDocumentKind ?? undefined,
			workspaceId: artifact.workspaceId ?? '',
			folderId: artifact.folderId ?? undefined,
			createdAt: artifact.createdAt,
			updatedAt: artifact.updatedAt,
			mimeType: artifact.mimeType ?? undefined,
			url: artifact.url ?? undefined,
			indexingStatus: artifact.indexingStatus ?? undefined,
			indexingFailureReason: artifact.indexingFailureReason ?? undefined,
			plainTextPreview: artifact.plainTextPreview ?? undefined,
			status: artifact.status ?? undefined
		}))
	) as WorkspaceArtifact[];
}

export function useWorkspaceIndexData() {
	const auth = getAuthState();
	// Gate queries on Clerk being signed-in (temuan a Phase 1/2): a hard-reload of a deep authed route
	// fires these before clerk-js loads → 401 tokenless → transient empty. `isSignedIn` = isLoaded && userId.
	const ready = () => auth.isSignedIn;
	const profile = useProfile();
	const workspacesQuery = useWorkspacesList(undefined, ready);
	const threadsQuery = useThreadsList(ready);
	const pinnedThreadsQuery = usePinnedThreads(ready);
	const createWorkspaceMutation = useCreateWorkspace();
	const archiveWorkspaceMutation = useArchiveWorkspace();
	const deleteThreadMutation = useDeleteThread();
	const pinThreadMutation = usePinThread();

	// Pinned + list disatukan dalam satu array `threads`. List utama sudah exclude pin di BE;
	// dedup by id tetap dijaga di sini sebagai guard saat jendela invalidasi (dua query refetch
	// tak sinkron sesaat). AppSidebar mem-partisi ulang jadi grup Disematkan/Terbaru/More via `pinnedAt`.
	function mergedThreads() {
		const pinnedThreads = flattenThreads(
			pinnedThreadsQuery.data ? [{ items: pinnedThreadsQuery.data }] : undefined
		);
		const pinnedThreadIds = new Set(pinnedThreads.map((thread) => thread.threadId));
		const listThreads = flattenThreads(threadsQuery.data?.pages).filter(
			(thread) => !pinnedThreadIds.has(thread.threadId)
		);
		return [...pinnedThreads, ...listThreads];
	}

	return {
		get isAuthenticated() {
			return auth.isLoaded && auth.isSignedIn;
		},
		get viewer() {
			return profile.data
				? {
						name: profile.data.name,
						email: profile.data.email,
						image: profile.data.image
					}
				: undefined;
		},
		get workspaces() {
			return flattenWorkspaces(workspacesQuery.data?.pages);
		},
		get threads() {
			return mergedThreads();
		},
		get isLoadingWorkspaces() {
			return workspacesQuery.isLoading;
		},
		createWorkspace: async (args: { name: string }) => {
			const workspace = await createWorkspaceMutation.mutateAsync(args);
			return 'id' in workspace ? workspace.id : String(workspace);
		},
		archiveWorkspace: async (args: { workspaceId: string }) => {
			await archiveWorkspaceMutation.mutateAsync({ id: args.workspaceId });
		},
		removeThread: async (args: { threadId: string }) => {
			await deleteThreadMutation.mutateAsync({ id: args.threadId });
			return { ok: true as const };
		},
		togglePinThread: async (args: { threadId: string; pinned: boolean }) => {
			await pinThreadMutation.mutateAsync({ id: args.threadId, pinned: args.pinned });
			return { ok: true as const };
		}
	};
}

export type WorkspaceLibraryData = ReturnType<typeof useWorkspaceLibraryData>;

export function useWorkspaceLibraryData(workspaceId: () => string) {
	const auth = getAuthState();
	const ready = () => auth.isSignedIn;
	const activeWorkspaceId = () => workspaceId() || '';
	const workspaceQuery = useWorkspace(activeWorkspaceId, ready);
	const workspacesQuery = useWorkspacesList(undefined, ready);
	const foldersQuery = useFolders(activeWorkspaceId, ready);
	const artifactsQuery = useArtifacts(activeWorkspaceId, () => null, ready);
	const updateWorkspaceMutation = useUpdateWorkspace();
	const archiveWorkspaceMutation = useArchiveWorkspace();
	const createFolderMutation = useCreateFolder();
	const renameFolderMutation = useRenameFolder();
	const moveFolderMutation = useMoveFolder();
	const deleteFolderMutation = useDeleteFolder();
	const createDocumentMutation = useCreateDocument(activeWorkspaceId);
	const saveUrlMutation = useSaveUrl();
	const renameArtifactMutation = useRenameArtifact();
	const moveArtifactMutation = useMoveArtifact();
	const deleteArtifactMutation = useDeleteArtifact();
	const uploadArtifactMutation = useUploadArtifact(activeWorkspaceId);

	return {
		get workspace() {
			return workspaceQuery.data
				? {
						_id: workspaceQuery.data.id,
						name: workspaceQuery.data.name,
						emoji: workspaceQuery.data.emoji ?? undefined,
						updatedAt: workspaceQuery.data.updatedAt
					}
				: workspaceQuery.isLoading
					? undefined
					: null;
		},
		get workspaces() {
			return flattenWorkspaces(workspacesQuery.data?.pages);
		},
		get folders() {
			return (
				Array.isArray(foldersQuery.data) ? foldersQuery.data : (foldersQuery.data?.items ?? [])
			).map(
				(folder: {
					id: string;
					name: string;
					workspaceId: string;
					createdAt: number;
					updatedAt: number;
				}) => ({
					_id: folder.id,
					name: folder.name,
					workspaceId: folder.workspaceId,
					createdAt: folder.createdAt,
					updatedAt: folder.updatedAt
				})
			);
		},
		get artifacts() {
			return flattenArtifacts(artifactsQuery.data?.pages);
		},
		get isLoading() {
			return (
				workspaceQuery.isLoading ||
				workspacesQuery.isLoading ||
				foldersQuery.isLoading ||
				artifactsQuery.isLoading
			);
		},
		renameWorkspace: async (args: { workspaceId: string; name: string }) => {
			await updateWorkspaceMutation.mutateAsync({ id: args.workspaceId, name: args.name });
		},
		updateWorkspaceEmoji: async (args: { workspaceId: string; emoji: string }) => {
			await updateWorkspaceMutation.mutateAsync({ id: args.workspaceId, emoji: args.emoji });
		},
		archiveWorkspace: async (args: { workspaceId: string }) => {
			await archiveWorkspaceMutation.mutateAsync({ id: args.workspaceId });
		},
		createFolder: async (args: { workspaceId: string; name: string }) => {
			await createFolderMutation.mutateAsync(args);
		},
		renameFolder: async (args: { folderId: string; name: string; workspaceId?: string }) => {
			await renameFolderMutation.mutateAsync({
				id: args.folderId,
				workspaceId: args.workspaceId ?? activeWorkspaceId(),
				name: args.name
			});
		},
		moveFolder: async (args: {
			folderId: string;
			targetWorkspaceId: string;
			workspaceId?: string;
		}) => {
			await moveFolderMutation.mutateAsync({
				id: args.folderId,
				workspaceId: args.workspaceId ?? activeWorkspaceId(),
				targetWorkspaceId: args.targetWorkspaceId
			});
		},
		removeFolder: async (args: { folderId: string; workspaceId?: string }) => {
			await deleteFolderMutation.mutateAsync({
				id: args.folderId,
				workspaceId: args.workspaceId ?? activeWorkspaceId()
			});
		},
		createDocument: async (args: { workspaceId: string; folderId?: string; title?: string }) => {
			const result = await createDocumentMutation.mutateAsync({
				folderId: args.folderId,
				title: args.title
			});
			return result.artifactId;
		},
		createUrl: async (args: {
			workspaceId: string;
			url: string;
			title?: string;
			folderId?: string;
		}) => {
			const result = await saveUrlMutation.mutateAsync(args);
			return result.artifactId;
		},
		renameArtifact: async (args: { artifactId: string; title: string }) => {
			await renameArtifactMutation.mutateAsync({ id: args.artifactId, title: args.title });
		},
		uploadArtifact: uploadArtifactMutation,
		updateDocument: async () => undefined,
		moveArtifact: async (args: {
			artifactId: string;
			folderId?: string;
			targetWorkspaceId?: string;
		}) => {
			await moveArtifactMutation.mutateAsync({
				id: args.artifactId,
				...(args.targetWorkspaceId ? { targetWorkspaceId: args.targetWorkspaceId } : {}),
				...(args.folderId !== undefined ? { folderId: args.folderId ?? null } : {})
			});
		},
		removeArtifact: async (args: { artifactId: string }) => {
			await deleteArtifactMutation.mutateAsync({ id: args.artifactId });
			return { ok: true as const };
		}
	};
}

export function useWorkspaceDetailData(workspaceId: () => string) {
	const index = useWorkspaceIndexData();
	const library = useWorkspaceLibraryData(workspaceId);
	const rateStatus = useSendStatus();

	return {
		get isAuthenticated() {
			return index.isAuthenticated;
		},
		get viewer() {
			return index.viewer;
		},
		get workspace() {
			return library.workspace;
		},
		get workspaces() {
			return library.workspaces;
		},
		get folders() {
			return library.folders;
		},
		get artifacts() {
			return library.artifacts;
		},
		get threads() {
			return index.threads;
		},
		get workspaceThreads() {
			return index.threads.filter((thread) => thread.workspaceId === workspaceId());
		},
		get rateStatus() {
			return rateStatus.data
				? {
						ok: rateStatus.data.canSend,
						serverTime: 0,
						canSend: rateStatus.data.canSend,
						reason: rateStatus.data.reason,
						retryAt: rateStatus.data.retryAt
					}
				: undefined;
		},
		get isLoading() {
			return library.isLoading;
		},
		createWorkspace: index.createWorkspace,
		renameWorkspace: library.renameWorkspace,
		updateWorkspaceEmoji: library.updateWorkspaceEmoji,
		archiveWorkspace: library.archiveWorkspace,
		createFolder: library.createFolder,
		renameFolder: library.renameFolder,
		moveFolder: library.moveFolder,
		removeFolder: library.removeFolder,
		createDocument: library.createDocument,
		createUrl: library.createUrl,
		renameArtifact: library.renameArtifact,
		moveArtifact: library.moveArtifact,
		removeArtifact: library.removeArtifact,
		uploadArtifact: library.uploadArtifact,
		updateDocument: library.updateDocument,
		removeThread: index.removeThread
	};
}

export function useArtifactDetailData(artifactId: () => string) {
	const auth = getAuthState();
	const ready = () => auth.isSignedIn;
	const index = useWorkspaceIndexData();
	const artifactQuery = useArtifact(artifactId, ready);
	const renderQuery = useArtifactRender(artifactId, ready);
	const updateDocumentMutation = useUpdateDocument(artifactId);
	const retryUrlMutation = useRetryUrlExtraction(artifactId);
	const renameArtifactMutation = useRenameArtifact();
	const moveArtifactMutation = useMoveArtifact();
	const deleteArtifactMutation = useDeleteArtifact();

	return {
		get isAuthenticated() {
			return index.isAuthenticated;
		},
		get viewer() {
			return index.viewer;
		},
		get workspaces() {
			return index.workspaces;
		},
		get threads() {
			return index.threads;
		},
		get artifact() {
			return artifactQuery.data ?? (artifactQuery.isLoading ? undefined : null);
		},
		get paperExtraction() {
			return undefined;
		},
		get renderPayload() {
			return renderQuery.data;
		},
		get isLoading() {
			return artifactQuery.isLoading || renderQuery.isLoading;
		},
		updateDocument: async (args: {
			title?: string;
			blocksJson?: string;
			markdown?: string;
			plainText: string;
		}) => {
			await updateDocumentMutation.mutateAsync(args);
		},
		retryUrlExtraction: async () => {
			await retryUrlMutation.mutateAsync();
		},
		retryGrobidExtraction: async () => ({
			ok: false as const,
			reason: 'not_available' as const
		}),
		renameArtifact: async (args: { artifactId: string; title: string }) => {
			await renameArtifactMutation.mutateAsync({ id: args.artifactId, title: args.title });
		},
		moveArtifact: async (args: { artifactId: string; targetWorkspaceId: string }) => {
			await moveArtifactMutation.mutateAsync({
				id: args.artifactId,
				targetWorkspaceId: args.targetWorkspaceId
			});
		},
		removeArtifact: async (args: { artifactId: string }) => {
			await deleteArtifactMutation.mutateAsync({ id: args.artifactId });
			return { ok: true as const };
		},
		createWorkspace: index.createWorkspace,
		removeThread: index.removeThread
	};
}

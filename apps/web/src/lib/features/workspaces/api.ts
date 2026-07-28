import {
	createInfiniteQuery,
	createMutation,
	createQuery,
	useQueryClient
} from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { getApiClient } from '$lib/api';
import { readableApiErrorMessage } from '$lib/errors';
import { queryKeys, unwrap } from '$lib/query';
import type { WorkspaceKind, WorkspaceKindInfo } from './types';
import { workspaceDetailQueryOptions, workspaceListQueryOptions } from './query-options';

/**
 * Workspace query/mutation hooks. Reactive scalar inputs (`id`, `workspaceId`) are getters
 * (svelte-query idiom). Query keys, stale policy, invalidation, and toast copy match the product contract.
 */

export type { WorkspaceListPage } from './query-options';

/**
 * List workspaces (infinite/keyset). `nextCursor` null = halaman terakhir. `enabled` gate = Clerk
 * `isLoaded` dari composite hooks: firing SEBELUM clerk-js load = 401 tokenless
 * → data kosong sesaat pada hard-reload rute authed dalam.
 */
export function useWorkspacesList(includeArchived: () => boolean, enabled: () => boolean) {
	const api = getApiClient();
	return createInfiniteQuery(() =>
		workspaceListQueryOptions(api, {
			includeArchived: includeArchived(),
			enabled: enabled()
		})
	);
}

/** Detail satu workspace (null bila tak ditemukan / bukan milik user). */
export function useWorkspace(id: () => string, enabled: () => boolean) {
	const api = getApiClient();
	return createQuery(() => workspaceDetailQueryOptions(api, { id: id(), enabled: enabled() }));
}

/** Folder aktif suatu workspace. */
export function useFolders(workspaceId: () => string, enabled: () => boolean) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.folders.list(workspaceId()),
		enabled: enabled() && Boolean(workspaceId()),
		queryFn: async () => unwrap(await api.workspaces({ id: workspaceId() }).folders.get())
	}));
}

export function useCreateWorkspace() {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: {
			name?: string;
			kind: WorkspaceKind;
			kindInfo?: WorkspaceKindInfo;
			topicNote?: string;
			deadline?: number;
		}) => unwrap(await api.workspaces.post(input)),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.workspaces.all }),
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal membuat proyek.'))
	}));
}

export function useUpdateWorkspace() {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: {
			id: string;
			name?: string;
			emoji?: string;
			description?: string | null;
			kindInfo?: WorkspaceKindInfo | null;
			deadline?: number | null;
			topicNote?: string | null;
		}) =>
			unwrap(
				await api.workspaces({ id: input.id }).patch({
					name: input.name,
					emoji: input.emoji,
					description: input.description,
					kindInfo: input.kindInfo,
					deadline: input.deadline,
					topicNote: input.topicNote
				})
			),
		onSuccess: (
			_d: unknown,
			input: {
				id: string;
				name?: string;
				emoji?: string;
				description?: string | null;
				kindInfo?: WorkspaceKindInfo | null;
				deadline?: number | null;
				topicNote?: string | null;
			}
		) => {
			qc.invalidateQueries({ queryKey: queryKeys.workspaces.all });
			qc.invalidateQueries({ queryKey: queryKeys.workspaces.detail(input.id) });
		},
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal memperbarui proyek.'))
	}));
}

export function useArchiveWorkspace() {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: { id: string }) =>
			unwrap(await api.workspaces({ id: input.id }).archive.post()),
		onSuccess: (_d: unknown, input: { id: string }) => {
			qc.invalidateQueries({ queryKey: queryKeys.workspaces.all });
			qc.invalidateQueries({ queryKey: queryKeys.workspaces.detail(input.id) });
		},
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal mengarsipkan workspace.'))
	}));
}

export function useCreateFolder() {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: { workspaceId: string; name: string }) =>
			unwrap(await api.workspaces({ id: input.workspaceId }).folders.post({ name: input.name })),
		onSuccess: (_d: unknown, input: { workspaceId: string; name: string }) =>
			qc.invalidateQueries({ queryKey: queryKeys.folders.list(input.workspaceId) }),
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal membuat folder.'))
	}));
}

export function useRenameFolder() {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: { id: string; workspaceId: string; name: string }) =>
			unwrap(await api.folders({ id: input.id }).patch({ name: input.name })),
		onSuccess: (_d: unknown, input: { id: string; workspaceId: string; name: string }) =>
			qc.invalidateQueries({ queryKey: queryKeys.folders.list(input.workspaceId) }),
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal mengubah nama folder.'))
	}));
}

export function useMoveFolder() {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: { id: string; workspaceId: string; targetWorkspaceId: string }) =>
			unwrap(
				await api
					.folders({ id: input.id })
					.move.post({ targetWorkspaceId: input.targetWorkspaceId })
			),
		onSuccess: (
			_d: unknown,
			input: { id: string; workspaceId: string; targetWorkspaceId: string }
		) => {
			qc.invalidateQueries({ queryKey: queryKeys.folders.list(input.workspaceId) });
			qc.invalidateQueries({ queryKey: queryKeys.folders.list(input.targetWorkspaceId) });
		},
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal memindahkan folder.'))
	}));
}

export function useDeleteFolder() {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: { id: string; workspaceId: string }) =>
			unwrap(await api.folders({ id: input.id }).delete()),
		onSuccess: (_d: unknown, input: { id: string; workspaceId: string }) =>
			qc.invalidateQueries({ queryKey: queryKeys.folders.list(input.workspaceId) }),
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal menghapus folder.'))
	}));
}

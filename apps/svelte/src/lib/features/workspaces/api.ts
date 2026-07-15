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

/**
 * Workspace query/mutation hooks. Reactive scalar inputs (`id`, `workspaceId`) are getters
 * (svelte-query idiom). Query keys, stale policy, invalidation, and toast copy match the product contract.
 */

const LIST_PAGE_SIZE = 25;

const alwaysFalse = () => false;
const alwaysTrue = () => true;

export type WorkspaceListPage = {
	items: Array<{
		id: string;
		name: string;
		emoji: string | null;
		updatedAt: number;
	}>;
	nextCursor: string | null;
};

/**
 * List workspaces (infinite/keyset). `nextCursor` null = halaman terakhir. `enabled` gate = Clerk
 * `isLoaded` dari composite hooks: firing SEBELUM clerk-js load = 401 tokenless
 * → data kosong sesaat pada hard-reload rute authed dalam.
 */
export function useWorkspacesList(
	includeArchived: () => boolean = alwaysFalse,
	enabled: () => boolean = alwaysTrue
) {
	const api = getApiClient();
	return createInfiniteQuery(() => ({
		queryKey: queryKeys.workspaces.list({ includeArchived: includeArchived() }),
		enabled: enabled(),
		initialPageParam: null as string | null,
		queryFn: async ({ pageParam }: { pageParam: string | null }) =>
			unwrap(
				await api.workspaces.get({
					query: {
						limit: LIST_PAGE_SIZE,
						includeArchived: includeArchived(),
						...(pageParam ? { cursor: pageParam } : {})
					}
				})
			) as WorkspaceListPage,
		getNextPageParam: (last: WorkspaceListPage) => last.nextCursor
	}));
}

/** Detail satu workspace (null bila tak ditemukan / bukan milik user). */
export function useWorkspace(id: () => string, enabled: () => boolean = alwaysTrue) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.workspaces.detail(id()),
		enabled: enabled() && Boolean(id()),
		queryFn: async () => unwrap(await api.workspaces({ id: id() }).get())
	}));
}

/** Folder aktif suatu workspace. */
export function useFolders(workspaceId: () => string, enabled: () => boolean = alwaysTrue) {
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
		mutationFn: async (input: { name: string }) =>
			unwrap(await api.workspaces.post({ name: input.name })),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.workspaces.all }),
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal membuat workspace.'))
	}));
}

export function useUpdateWorkspace() {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: { id: string; name?: string; emoji?: string }) =>
			unwrap(
				await api.workspaces({ id: input.id }).patch({ name: input.name, emoji: input.emoji })
			),
		onSuccess: (_d: unknown, input: { id: string; name?: string; emoji?: string }) => {
			qc.invalidateQueries({ queryKey: queryKeys.workspaces.all });
			qc.invalidateQueries({ queryKey: queryKeys.workspaces.detail(input.id) });
		},
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal memperbarui workspace.'))
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

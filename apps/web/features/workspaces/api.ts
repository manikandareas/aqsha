"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { useApi } from "@/lib/api-client";
import { readableApiErrorMessage } from "@/lib/api-error";
import { queryKeys, unwrap } from "@/lib/api-query";

const LIST_PAGE_SIZE = 25;

/** List workspaces (infinite/keyset). `nextCursor` null = halaman terakhir. */
export function useWorkspacesList(includeArchived: boolean) {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: queryKeys.workspaces.list({ includeArchived }),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await api.workspaces.get({
          query: {
            limit: LIST_PAGE_SIZE,
            includeArchived,
            ...(pageParam ? { cursor: pageParam } : {}),
          },
        }),
      ),
    getNextPageParam: (last) => last.nextCursor,
  });
}

/** Detail satu workspace (null bila tak ditemukan / bukan milik user). */
export function useWorkspace(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.workspaces.detail(id),
    queryFn: async () => unwrap(await api.workspaces({ id }).get()),
  });
}

/** Folder aktif suatu workspace. */
export function useFolders(workspaceId: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.folders.list(workspaceId),
    queryFn: async () => unwrap(await api.workspaces({ id: workspaceId }).folders.get()),
  });
}

export function useCreateWorkspace() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string }) =>
      unwrap(await api.workspaces.post({ name: input.name })),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.workspaces.all }),
    onError: (e) => toast.error(readableApiErrorMessage(e, "Gagal membuat workspace.")),
  });
}

export function useUpdateWorkspace() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; name?: string; emoji?: string }) =>
      unwrap(
        await api.workspaces({ id: input.id }).patch({ name: input.name, emoji: input.emoji }),
      ),
    onSuccess: (_d, input) => {
      qc.invalidateQueries({ queryKey: queryKeys.workspaces.all });
      qc.invalidateQueries({ queryKey: queryKeys.workspaces.detail(input.id) });
    },
    onError: (e) => toast.error(readableApiErrorMessage(e, "Gagal memperbarui workspace.")),
  });
}

export function useArchiveWorkspace() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string }) =>
      unwrap(await api.workspaces({ id: input.id }).archive.post()),
    onSuccess: (_d, input) => {
      qc.invalidateQueries({ queryKey: queryKeys.workspaces.all });
      qc.invalidateQueries({ queryKey: queryKeys.workspaces.detail(input.id) });
    },
    onError: (e) => toast.error(readableApiErrorMessage(e, "Gagal mengarsipkan workspace.")),
  });
}

export function useCreateFolder() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { workspaceId: string; name: string }) =>
      unwrap(await api.workspaces({ id: input.workspaceId }).folders.post({ name: input.name })),
    onSuccess: (_d, input) =>
      qc.invalidateQueries({ queryKey: queryKeys.folders.list(input.workspaceId) }),
    onError: (e) => toast.error(readableApiErrorMessage(e, "Gagal membuat folder.")),
  });
}

export function useRenameFolder() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; workspaceId: string; name: string }) =>
      unwrap(await api.folders({ id: input.id }).patch({ name: input.name })),
    onSuccess: (_d, input) =>
      qc.invalidateQueries({ queryKey: queryKeys.folders.list(input.workspaceId) }),
    onError: (e) => toast.error(readableApiErrorMessage(e, "Gagal mengubah nama folder.")),
  });
}

export function useMoveFolder() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; workspaceId: string; targetWorkspaceId: string }) =>
      unwrap(
        await api.folders({ id: input.id }).move.post({ targetWorkspaceId: input.targetWorkspaceId }),
      ),
    onSuccess: (_d, input) => {
      qc.invalidateQueries({ queryKey: queryKeys.folders.list(input.workspaceId) });
      qc.invalidateQueries({ queryKey: queryKeys.folders.list(input.targetWorkspaceId) });
    },
    onError: (e) => toast.error(readableApiErrorMessage(e, "Gagal memindahkan folder.")),
  });
}

export function useDeleteFolder() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; workspaceId: string }) =>
      unwrap(await api.folders({ id: input.id }).delete()),
    onSuccess: (_d, input) =>
      qc.invalidateQueries({ queryKey: queryKeys.folders.list(input.workspaceId) }),
    onError: (e) => toast.error(readableApiErrorMessage(e, "Gagal menghapus folder.")),
  });
}

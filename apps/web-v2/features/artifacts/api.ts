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

const LIST_PAGE_SIZE = 30;

/** List artifact aktif workspace (opsional folder), keyset infinite. */
export function useArtifacts(workspaceId: string, folderId?: string | null) {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: queryKeys.artifacts.list(workspaceId, folderId ?? null),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await api.workspaces({ id: workspaceId }).artifacts.get({
          query: {
            limit: LIST_PAGE_SIZE,
            ...(folderId ? { folderId } : {}),
            ...(pageParam ? { cursor: pageParam } : {}),
          },
        }),
      ),
    getNextPageParam: (last) => last.nextCursor,
  });
}

/**
 * Artifact aktif workspace untuk `@mention` context picker (Slice 6.6) — top-50,
 * non-paginated. `enabled` di-drive UI (hanya fetch saat user men-drill ke
 * workspace di palette).
 */
export function useContextPickerArtifacts(workspaceId: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: ["artifacts", "context-picker", workspaceId] as const,
    enabled: workspaceId !== null,
    queryFn: async () =>
      unwrap(await api.workspaces({ id: workspaceId ?? "" }).artifacts["context-picker"].get()),
  });
}

/** Detail artifact (null bila tak ditemukan / bukan milik user). */
export function useArtifact(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.artifacts.detail(id),
    queryFn: async () => unwrap(await api.artifacts({ id }).get()),
  });
}

/** Render payload (discriminated union) untuk reader. */
export function useArtifactRender(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.artifacts.render(id),
    queryFn: async () => unwrap(await api.artifacts({ id })["render-payload"].get()),
  });
}

export function useCreateDocument(workspaceId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { folderId?: string; title?: string }) => {
      // unwrap melempar pada error status (mis. 429/403) → sukses pasti { artifactId }.
      const res = unwrap(
        await api.workspaces({ id: workspaceId }).documents.post({
          folderId: input.folderId,
          title: input.title,
        }),
      );
      return res as { artifactId: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.artifacts.all }),
    onError: (e) => toast.error(readableApiErrorMessage(e, "Gagal membuat dokumen.")),
  });
}

export function useUpdateDocument(id: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      title?: string;
      blocksJson?: string;
      markdown?: string;
      plainText: string;
    }) => unwrap(await api.artifacts({ id }).document.put(input)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.artifacts.detail(id) });
      qc.invalidateQueries({ queryKey: queryKeys.artifacts.render(id) });
      qc.invalidateQueries({ queryKey: queryKeys.artifacts.all });
    },
    onError: (e) => toast.error(readableApiErrorMessage(e, "Gagal menyimpan dokumen.")),
  });
}

export function useRenameArtifact() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; title: string }) =>
      unwrap(await api.artifacts({ id: input.id }).patch({ title: input.title })),
    onSuccess: (_d, input) => {
      qc.invalidateQueries({ queryKey: queryKeys.artifacts.all });
      qc.invalidateQueries({ queryKey: queryKeys.artifacts.detail(input.id) });
    },
    onError: (e) => toast.error(readableApiErrorMessage(e, "Gagal mengubah nama.")),
  });
}

export function useMoveArtifact() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      targetWorkspaceId?: string;
      folderId?: string | null;
    }) =>
      unwrap(
        await api.artifacts({ id: input.id }).patch({
          ...(input.targetWorkspaceId ? { targetWorkspaceId: input.targetWorkspaceId } : {}),
          ...(input.folderId !== undefined ? { folderId: input.folderId } : {}),
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.artifacts.all }),
    onError: (e) => toast.error(readableApiErrorMessage(e, "Gagal memindahkan artefak.")),
  });
}

/**
 * Save URL ke workspace (createUrl) → enqueue url-ingestion. Idempotent (dedupe).
 * Unbound: workspaceId di call-time (library pakai current ws; SaveToWorkspaceButton
 * pakai ws dari picker).
 */
export function useSaveUrl() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { workspaceId: string; url: string; title?: string; folderId?: string }) => {
      const res = unwrap(
        await api.workspaces({ id: input.workspaceId }).artifacts.url.post({
          url: input.url,
          title: input.title,
          folderId: input.folderId,
        }),
      );
      return res as { artifactId: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.artifacts.all }),
    onError: (e) => toast.error(readableApiErrorMessage(e, "Gagal menyimpan tautan.")),
  });
}

export function useRetryUrlExtraction(id: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      unwrap(await api.artifacts({ id })["retry-url-extraction"].post()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.artifacts.detail(id) });
      qc.invalidateQueries({ queryKey: queryKeys.artifacts.render(id) });
      qc.invalidateQueries({ queryKey: queryKeys.artifacts.all });
    },
    onError: (e) => toast.error(readableApiErrorMessage(e, "Gagal mengulang ekstraksi.")),
  });
}

/** Upload file 3-langkah: presign → PUT langsung ke object storage → finalize (ekstrak inline). */
export function useUploadArtifact(workspaceId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { file: File; folderId?: string }) => {
      const presign = unwrap(await api.artifacts["upload-url"].post({ workspaceId }));
      const put = await fetch(presign.uploadUrl, { method: "PUT", body: input.file });
      if (!put.ok) throw new Error("Gagal mengunggah berkas ke penyimpanan.");
      const res = unwrap(
        await api.workspaces({ id: workspaceId }).artifacts.upload.post({
          key: presign.key,
          folderId: input.folderId,
          fileName: input.file.name,
          mimeType: input.file.type || "application/octet-stream",
          size: input.file.size,
        }),
      );
      return res as { artifactId: string; title: string; indexed: boolean };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.artifacts.all }),
    onError: (e) => toast.error(readableApiErrorMessage(e, "Gagal mengunggah berkas.")),
  });
}

/**
 * Save-to-Workspace untuk artifact HEADLESS (dibuat agen, `workspaceId=null`) — Slice 6.5.
 * Beda dari `useMoveArtifact` (move artifact yang sudah ter-file): di sini parent
 * `workspaceId` masih null, jadi pakai endpoint `linkToWorkspace` terpisah.
 */
export function useLinkArtifactToWorkspace() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; workspaceId: string }) =>
      unwrap(
        await api.artifacts({ id: input.id })["link-workspace"].post({
          workspaceId: input.workspaceId,
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.artifacts.all }),
    onError: (e) => toast.error(readableApiErrorMessage(e, "Gagal menyimpan ke workspace.")),
  });
}

export function useDeleteArtifact() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string }) =>
      unwrap(await api.artifacts({ id: input.id }).delete()),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.artifacts.all }),
    onError: (e) => toast.error(readableApiErrorMessage(e, "Gagal menghapus artefak.")),
  });
}

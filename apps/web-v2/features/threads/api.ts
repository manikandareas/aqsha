"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Artifact } from "@/features/artifacts/types";
import { useApi } from "@/lib/api-client";
import { readableApiErrorMessage } from "@/lib/api-error";
import { queryKeys, unwrap } from "@/lib/api-query";
import type { ChatMessage, ChatThread, ResearchSource } from "./types";

const LIST_PAGE_SIZE = 30;

/** List thread (infinite/keyset, DESC aktivitas). */
export function useThreadsList() {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: queryKeys.threads.list(),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await api.threads.get({
          query: { limit: LIST_PAGE_SIZE, ...(pageParam ? { cursor: pageParam } : {}) },
        }),
      ) as { items: ChatThread[]; nextCursor: string | null },
    getNextPageParam: (last) => last.nextCursor,
  });
}

/** Detail satu thread (null bila tak ditemukan / bukan milik user). */
export function useThread(id: string, enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.threads.detail(id),
    enabled,
    queryFn: async () => (unwrap(await api.threads({ id }).get()) as ChatThread | null) ?? null,
  });
}

/**
 * Transkrip thread (history persisted). `staleTime: Infinity` + tanpa refetch fokus:
 * dalam sesi live, buffer eve (`useAstraAgent`) yang jadi sumber turn berjalan; history
 * = snapshot mount supaya tak duplikat dengan live. Switch thread (queryKey berubah)
 * memuat ulang.
 */
export function useThreadMessages(id: string, enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.threads.messages(id),
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async () =>
      (unwrap(await api.threads({ id }).messages.get()) as { items: ChatMessage[] }).items,
  });
}

/**
 * Status kirim (Slice 6.2) — pre-check UX-ramah: entitlement preview + cooldown rate-limit,
 * non-consuming. Backstop otoritatif tetap di `onMessage` proses eve. Tipe hasil di-infer
 * Eden dari route `GET /threads/send-status` (tanpa impor `@aqsha/services` di client).
 *
 * `feature='deep_research'` (Slice 7.0) → status sadar-cap deep (untuk notice saat `/deep`
 * aktif). Key di-scope per-feature → cache terpisah dari pre-check normal_chat.
 */
export function useSendStatus(
  feature: "normal_chat" | "deep_research" = "normal_chat",
  enabled = true,
) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.threads.sendStatus(feature),
    enabled,
    staleTime: 10_000,
    queryFn: async () =>
      unwrap(
        await api.threads["send-status"].get(
          feature === "deep_research" ? { query: { feature } } : { query: {} },
        ),
      ),
  });
}

/**
 * Sumber riset thread (Slice 6.4) — dipersist tool Astra (`search_web`/`search_arxiv`/
 * dst.) ke `research_sources`. Persisted per thread → tampil saat reload (panel Sources).
 * `staleTime` pendek supaya sumber turn yang baru selesai muncul setelah `onFinish`.
 */
export function useThreadSources(id: string, enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.threads.sources(id),
    enabled,
    staleTime: 10_000,
    queryFn: async () =>
      (unwrap(await api.threads({ id }).sources.get()) as { items: ResearchSource[] }).items,
  });
}

/**
 * Hydrate konteks `@mention` (Slice 6.6) — resolve workspace/paper yang di-pin
 * composer → catatan ringkas + id tervalidasi (ownership di-cek server). Dipanggil
 * saat submit bila ada pin; hasilnya dikirim sebagai `clientContext` ephemeral ke
 * proses eve. Mutation (bukan query): aksi sekali-jalan per turn.
 */
export function useHydrateContext() {
  const api = useApi();
  return useMutation({
    mutationFn: async (input: { workspaceIds: string[]; artifactIds: string[] }) =>
      unwrap(await api.threads.context.hydrate.post(input)),
  });
}

export function useRenameThread() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; title: string }) =>
      unwrap(await api.threads({ id: input.id }).patch({ title: input.title })),
    onSuccess: (_d, input) => {
      qc.invalidateQueries({ queryKey: queryKeys.threads.all });
      qc.invalidateQueries({ queryKey: queryKeys.threads.detail(input.id) });
    },
    onError: (e) => toast.error(readableApiErrorMessage(e, "Gagal mengubah judul.")),
  });
}

export function useDeleteThread() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string }) => unwrap(await api.threads({ id: input.id }).delete()),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.threads.all }),
    onError: (e) => toast.error(readableApiErrorMessage(e, "Gagal menghapus percakapan.")),
  });
}

/** Artifact yang terlampir pada thread (Slice 6.7) — headless (workspaceId=null). */
export function useThreadArtifacts(threadId: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.threads.artifacts(threadId ?? ""),
    enabled: Boolean(threadId),
    queryFn: async () =>
      (unwrap(await api.threads({ id: threadId ?? "" }).artifacts.get()) as { items: Artifact[] })
        .items,
  });
}

/**
 * Lampiran thread 3-langkah (Slice 6.7): presign → PUT object storage → finalize
 * (ekstrak inline + RAG index, headless). Mirror `useUploadArtifact` tapi thread-scoped:
 * ownership = thread (assertOwner route-side), bukan workspace.
 */
export function useThreadAttachments(threadId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { file: File }) => {
      const presign = unwrap(
        await api.threads({ id: threadId }).attachments["upload-url"].post(),
      );
      const put = await fetch(presign.uploadUrl, { method: "PUT", body: input.file });
      if (!put.ok) throw new Error("Gagal mengunggah berkas ke penyimpanan.");
      return unwrap(
        await api.threads({ id: threadId }).attachments.post({
          key: presign.key,
          fileName: input.file.name,
          mimeType: input.file.type || "application/octet-stream",
          size: input.file.size,
        }),
      ) as { artifactId: string; title: string; indexed: boolean };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.threads.artifacts(threadId) }),
    onError: (e) => toast.error(readableApiErrorMessage(e, "Gagal melampirkan berkas.")),
  });
}

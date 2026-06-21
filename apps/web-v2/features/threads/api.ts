"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
export function useThread(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.threads.detail(id),
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
 */
export function useSendStatus() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.threads.sendStatus(),
    staleTime: 10_000,
    queryFn: async () => unwrap(await api.threads["send-status"].get()),
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

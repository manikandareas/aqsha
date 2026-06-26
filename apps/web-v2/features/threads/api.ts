"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Artifact } from "@/features/artifacts/types";
import { useApi } from "@/lib/api-client";
import { readableApiErrorMessage } from "@/lib/api-error";
import { queryKeys, unwrap } from "@/lib/api-query";
import type { ChatMessage, ChatThread, ChatThreadEvent, ResearchSource } from "./types";

const LIST_PAGE_SIZE = 30;
const ACTIVE_THREAD_EVENTS_POLL_MS = 2_000;

/** Tipe delta kumulatif eve — hanya yang TERAKHIR per (type, turn, step) yang berarti. */
const STREAMING_DELTA_TYPES = new Set(["message.appended", "reasoning.appended"]);

/**
 * Buang delta streaming yang sudah disusul dari log terakumulasi klien (jaga `prev` mungil
 * di akumulasi poll). Kunci = (type, turn_id, stepIndex); simpan index tertinggi. Array masuk
 * sudah urut `event_index` (poll selalu `> afterIndex`), jadi yang terakhir = terbaru.
 */
function compactThreadEvents(events: ChatThreadEvent[]): ChatThreadEvent[] {
  const keyOf = (e: ChatThreadEvent) =>
    `${e.type}:${e.turnId}:${String((e.payload as { data?: { stepIndex?: unknown } })?.data?.stepIndex)}`;
  const lastAt = new Map<string, number>();
  events.forEach((e, i) => {
    if (STREAMING_DELTA_TYPES.has(e.type)) lastAt.set(keyOf(e), i);
  });
  if (lastAt.size === 0) return events;
  return events.filter(
    (e, i) => !STREAMING_DELTA_TYPES.has(e.type) || lastAt.get(keyOf(e)) === i,
  );
}

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
 * Event stream eve mentah per thread (1:1) — di-replay lewat `defaultMessageReducer` untuk
 * merekonstruksi timeline PENUH (tool/skill/subagent/HITL) saat reload. Default = snapshot
 * saat mount. Thread yang masih aktif boleh menyalakan polling pendek sebagai fallback durable
 * untuk mengejar event persisted bila resume-stream putus/tertahan; polling berhenti begitu
 * predicate active mengembalikan false. `staleTime: 0` supaya invalidate selalu ambil event
 * terbaru.
 */
export function useThreadEvents(
  id: string,
  options: boolean | {
    enabled?: boolean;
    poll?: boolean | ((events: readonly ChatThreadEvent[]) => boolean);
  } = true,
) {
  const api = useApi();
  const qc = useQueryClient();
  const enabled = typeof options === "boolean" ? options : (options.enabled ?? true);
  const poll = typeof options === "boolean" ? false : (options.poll ?? false);
  return useQuery({
    queryKey: queryKeys.threads.events(id),
    enabled,
    staleTime: 0,
    refetchInterval: (query) => {
      if (!poll) return false;
      const events = (query.state.data ?? []) as ChatThreadEvent[];
      const shouldPoll = typeof poll === "function" ? poll(events) : poll;
      return shouldPoll ? ACTIVE_THREAD_EVENTS_POLL_MS : false;
    },
    refetchIntervalInBackground: Boolean(poll),
    // Akumulasi INCREMENTAL: poll mengejar hanya delta (`afterIndex` = event_index terakhir)
    // lalu append — run `/deep` bisa ribuan event, re-fetch penuh tiap 2 dtk itu berat & jadi
    // sumber "beku" (heavy reduce). Cold mount (cache kosong) → full snapshot. Delta kosong →
    // kembalikan ref lama (tanpa re-render). Server meng-compact delta kumulatif (lihat
    // `ChatThreadEventRepo.listByThread`); klien JUGA compact tiap append supaya `prev` tetap
    // mungil — poll mengembalikan delta-terakhir step aktif tiap tick di index baru, tanpa
    // dedup `prev` akan tumbuh O(n²) lagi.
    queryFn: async () => {
      const prev = (qc.getQueryData(queryKeys.threads.events(id)) ?? []) as ChatThreadEvent[];
      const afterIndex = prev.length > 0 ? prev[prev.length - 1].eventIndex : undefined;
      const { items } = unwrap(
        await api.threads({ id }).events.get({
          query: afterIndex !== undefined ? { afterIndex } : {},
        }),
      ) as { items: ChatThreadEvent[] };
      if (afterIndex === undefined) return items;
      if (items.length === 0) return prev;
      return compactThreadEvents([...prev, ...items]);
    },
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

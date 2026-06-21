"use client";

import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { useApi } from "@/lib/api-client";
import { queryKeys, unwrap } from "@/lib/api-query";
import type {
  DiscoveryItemRef,
  ExplorePaper,
  FeedItem,
  FeedMode,
  FeedTopic,
  SupportingPaper,
} from "./types";

const FEED_PAGE_SIZE = 20;

type FeedPage = { items: FeedItem[]; nextCursor: string | null };

/**
 * Feed infinite-scroll keyset (For You/Top/Topics). `nextCursor` null = halaman terakhir.
 * Catatan: page bisa menyusut < limit (filter hidden/kind/topic server-side) sementara
 * nextCursor tetap benar → komponen auto-load lanjut selama `hasNextPage`.
 */
export function useFeedInfinite(mode: FeedMode, topic: FeedTopic | null) {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: queryKeys.feed.list({ mode, topic }),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await api.feed.get({
          query: {
            limit: FEED_PAGE_SIZE,
            mode,
            ...(topic ? { topic } : {}),
            ...(pageParam ? { cursor: pageParam } : {}),
          },
        }),
      ) as FeedPage,
    getNextPageParam: (last) => last.nextCursor,
  });
}

/** Global search lintas konten (tsvector). Enabled hanya saat `q` non-kosong. */
export function useSearchDiscovery(q: string) {
  const api = useApi();
  const trimmed = q.trim();
  return useInfiniteQuery({
    queryKey: queryKeys.feed.search({ q: trimmed, fromYear: null }),
    enabled: trimmed.length > 0,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await api.feed.search.get({
          query: { q: trimmed, limit: 20, ...(pageParam ? { cursor: pageParam } : {}) },
        }),
      ) as FeedPage,
    getNextPageParam: (last) => last.nextCursor,
  });
}

/** Bento home (getFeed) untuk HomeExploreBento di /app. */
export function useFeedHome() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.feed.list({ mode: "home", topic: null }),
    queryFn: async () =>
      (unwrap(await api.feed.home.get({ query: {} })) as { items: FeedItem[] }).items,
  });
}

/** Hide item discovery (+ interest −1). Optimistic removal di-handle pemanggil. */
export function useHideDiscovery() {
  const api = useApi();
  return useMutation({
    mutationFn: async (itemRef: DiscoveryItemRef) =>
      unwrap(await api.feed.discovery.hide.post({ itemRef })),
  });
}

/** Catat interaksi discovery (save +1 / research +2 / open_evidence). */
export function useRecordInteraction() {
  const api = useApi();
  return useMutation({
    mutationFn: async (input: {
      itemRef: DiscoveryItemRef;
      kind: "save" | "hide" | "research" | "open_evidence";
    }) => unwrap(await api.feed.discovery.interaction.post(input)),
  });
}

/** Reader paper (getOrFetchPaper cold-resolve). `null` = tak teresolve. */
export function usePaper(key: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.papers.detail(key),
    queryFn: async () => (unwrap(await api.papers({ key }).get({ query: {} })) ?? null) as ExplorePaper | null,
  });
}

/** Reader feed item (news/fact). */
export function useFeedItem(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.feed.item(id),
    queryFn: async () => unwrap(await api.feed({ id }).get()) as FeedItem,
  });
}

/** Related same-kind ("Discover more"). */
export function useRelated(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: [...queryKeys.feed.item(id), "related"],
    queryFn: async () =>
      (unwrap(await api.feed({ id }).related.get({ query: {} })) as { items: FeedItem[] }).items,
  });
}

/** Paper pendukung klaim (evidence drawer). */
export function usePapersByKeys(keys: string[]) {
  const api = useApi();
  return useQuery({
    queryKey: ["papers", "by-keys", keys],
    enabled: keys.length > 0,
    queryFn: async () =>
      (
        unwrap(await api.feed["papers-by-keys"].get({ query: { keys } })) as {
          papers: SupportingPaper[];
        }
      ).papers,
  });
}

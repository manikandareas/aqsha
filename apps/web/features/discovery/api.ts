"use client";

import { keepPreviousData, useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { useApi } from "@/lib/api-client";
import { queryKeys, unwrap } from "@/lib/api-query";
import type {
  DiscoveryItemRef,
  ExplorePaper,
  FeedItem,
  FeedMode,
  FeedTopic,
} from "./types";

const FEED_PAGE_SIZE = 20;

// Hanya paper + berita sains yang punya value riset; claim/topic/idea dipangkas.
const VISIBLE_KINDS = ["paper", "news"] as const;

type FeedPage = { items: FeedItem[]; nextCursor: string | null };

/**
 * Feed infinite-scroll keyset (For You/Top/Topics). `nextCursor` null = halaman terakhir.
 * Catatan: page bisa menyusut < limit (filter hidden/kind/topic server-side) sementara
 * nextCursor tetap benar → komponen auto-load lanjut selama `hasNextPage`.
 */
export function useFeedInfinite(mode: FeedMode, topic: FeedTopic | null, enabled = true) {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: queryKeys.feed.list({ mode, topic }),
    enabled,
    // Ganti topik tetap menampilkan feed lama (di-fade) selagi yang baru dimuat —
    // hindari kedip spinner penuh saat berpindah antar-topik di Jelajahi.
    placeholderData: keepPreviousData,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await api.feed.get({
          query: {
            limit: FEED_PAGE_SIZE,
            mode,
            kinds: [...VISIBLE_KINDS],
            ...(topic ? { topic } : {}),
            ...(pageParam ? { cursor: pageParam } : {}),
          },
        }),
      ) as FeedPage,
    getNextPageParam: (last) => last.nextCursor,
  });
}

export type SearchPaper = Omit<ExplorePaper, "lastSeenAt">;
export type PaperSearchPage = {
  items: SearchPaper[];
  cached?: boolean;
  /** Halaman berikutnya (OpenAlex basic-paging) untuk load-more; null = habis. */
  nextPage: number | null;
};

/**
 * Live academic paper search — waterfall OpenAlex→arXiv→Crossref via /papers/search
 * (mode=search), GRATIS + rate-limited server-side. Load-more manual via `page`
 * (OpenAlex `page`); `nextPage` null = habis. Enabled hanya saat `q` non-kosong.
 */
export function usePaperSearch(q: string, fromYear: number | undefined, enabled: boolean) {
  const api = useApi();
  const trimmed = q.trim();
  return useInfiniteQuery({
    queryKey: queryKeys.papers.search({ query: trimmed, fromYear: fromYear ?? null }),
    enabled: enabled && trimmed.length > 0,
    // Hasil lama tetap tampil (di-fade) saat kueri berubah → transisi mulus tanpa spinner.
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    initialPageParam: 1 as number,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await api.papers.search.get({
          query: {
            query: trimmed,
            mode: "search",
            limit: 12,
            page: pageParam,
            ...(fromYear ? { fromYear } : {}),
          },
        }),
      ) as PaperSearchPage,
    getNextPageParam: (last) => last.nextPage,
  });
}

/** Bento home (getFeed) untuk HomeExploreBento di /app. */
export function useFeedHome() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.feed.list({ mode: "home", topic: null }),
    queryFn: async () =>
      (
        unwrap(await api.feed.home.get({ query: { kinds: [...VISIBLE_KINDS] } })) as {
          items: FeedItem[];
        }
      ).items,
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

/** Catat interaksi discovery (save +1 / research +2). */
export function useRecordInteraction() {
  const api = useApi();
  return useMutation({
    mutationFn: async (input: {
      itemRef: DiscoveryItemRef;
      kind: "save" | "hide" | "research";
    }) => unwrap(await api.feed.discovery.interaction.post(input)),
  });
}

/**
 * Reader paper (getPaperDetail: cache/cold-resolve + enrichment OpenAlex). `null` = tak
 * teresolve. Key dibawa sebagai QUERY PARAM — kunci kanonik mengandung `/` (DOI/url) yang
 * akan memecah path segment kalau dikirim sebagai path param Eden.
 */
export function usePaper(key: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.papers.detail(key),
    queryFn: async () =>
      (unwrap(await api.papers.detail.get({ query: { key } })) ?? null) as ExplorePaper | null,
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

"use client";

import { CheckCircle2Icon, Loader2Icon, SparklesIcon } from "@aqsha/ui/icons";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { readableApiErrorMessage } from "@/lib/api-error";
import {
  useFeedHome,
  useFeedInfinite,
  useHideDiscovery,
  usePaperSearch,
  useRecordInteraction,
  useSearchDiscovery,
} from "../api";
import { deriveTopCited } from "../aggregate";
import {
  discoveryItemKey,
  feedItemToDiscoveryItem,
  paperToDiscoveryItem,
  type DiscoveryItem,
} from "../model";
import { rangeToFromYear, type DiscoveryRange } from "../nav";
import type { FeedItem, FeedMode, FeedTopic } from "../types";
import { DiscoveryAside } from "./discovery-aside";
import {
  DiscoveryFeatureCard,
  DiscoveryHeroCard,
  DiscoveryStandardCard,
  type DiscoveryCardHandlers,
} from "./discovery-item-card";
import { DiscoveryListItem } from "./discovery-list-item";
import { DiscoveryHeaderControls, DiscoveryModeNav } from "./discovery-toolbar";

// Bound consecutive auto-loads between scrolls so a run of locally-hidden items
// (page shrinks below limit without advancing) can't spin the observer.
const MAX_AUTO_LOADS = 4;

export function DiscoveryPage() {
  const router = useRouter();

  const [mode, setMode] = useState<FeedMode>("foryou");
  const [topic, setTopic] = useState<FeedTopic | null>(null);
  const [q, setQ] = useState("");
  const [range, setRange] = useState<DiscoveryRange>("all");
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());

  const searchActive = q.trim().length > 0;
  const activeTopic = mode === "topics" ? topic : null;

  const feedQuery = useFeedInfinite(mode, searchActive ? null : activeTopic);
  const searchQuery = useSearchDiscovery(searchActive ? q : "", rangeToFromYear(range));
  const active = searchActive ? searchQuery : feedQuery;

  const hide = useHideDiscovery();
  const record = useRecordInteraction();

  // Derived values below are auto-memoized by React Compiler — no manual useMemo.
  // Flatten → dedupe → map to DiscoveryItem (feed ref) → drop locally-hidden.
  const items: DiscoveryItem[] = [];
  {
    const seen = new Set<string>();
    for (const page of active.data?.pages ?? []) {
      for (const raw of page.items as FeedItem[]) {
        if (seen.has(raw._id)) continue;
        seen.add(raw._id);
        const item = feedItemToDiscoveryItem(raw);
        if (!hiddenIds.has(discoveryItemKey(item))) items.push(item);
      }
    }
  }

  const rawCount = (active.data?.pages ?? []).reduce((n, p) => n + p.items.length, 0);

  // Aside aggregates read the stable /feed/home pool (not the growing paginated
  // list) so the right rail stays put across loadMore and search.
  const homeQuery = useFeedHome();
  const asideItems = (homeQuery.data ?? []).map((raw) => feedItemToDiscoveryItem(raw));
  const topCited = deriveTopCited(asideItems, 4);

  // Live external augmentation: once the in-app index is exhausted, append
  // uncached external papers as one block (deferred so the dedup against feed
  // paper keys stays stable). Filtered vs same-session hides + the index's keys.
  // ponytail: cross-session hidden-refs for not-yet-materialized papers skipped.
  const indexExhausted = searchActive && !searchQuery.hasNextPage && !searchQuery.isPending;
  const paperSearch = usePaperSearch(q, rangeToFromYear(range), indexExhausted);
  const feedPaperKeys = new Set<string>();
  for (const it of items) if (it.paperKey) feedPaperKeys.add(it.paperKey);
  const externalItems: DiscoveryItem[] = [];
  if (indexExhausted) {
    for (const p of paperSearch.data?.items ?? []) {
      if (feedPaperKeys.has(p.key)) continue;
      const it = paperToDiscoveryItem(p);
      if (!hiddenIds.has(discoveryItemKey(it))) externalItems.push(it);
    }
  }
  const allItems = searchActive ? [...items, ...externalItems] : items;
  const externalPending = indexExhausted && paperSearch.isFetching;
  const searchBlocked = paperSearch.data?.blocked ?? null;

  const fetchNextPage = active.fetchNextPage;
  const hasNextPage = active.hasNextPage;
  const isFetchingNextPage = active.isFetchingNextPage;
  const isLoadingFirst = active.isPending && (!searchActive || searchQuery.isFetching);

  const feedStatus: FeedStatus = isFetchingNextPage
    ? "LoadingMore"
    : hasNextPage
      ? "CanLoadMore"
      : "Exhausted";

  // Auto-load budget plumbing.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const autoLoadCountRef = useRef(0);
  const prevRawRef = useRef(0);

  // Reset budget when the session restarts at page 1 (mode/topic/search/range switch).
  const sessionKey = searchActive ? `search:${q}:${range}` : `feed:${mode}:${topic ?? ""}`;
  useEffect(() => {
    autoLoadCountRef.current = 0;
    prevRawRef.current = 0;
  }, [sessionKey]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (feedStatus !== "CanLoadMore") return;
        if (rawCount !== prevRawRef.current) {
          if (rawCount > prevRawRef.current) autoLoadCountRef.current = 0;
          prevRawRef.current = rawCount;
        }
        if (autoLoadCountRef.current >= MAX_AUTO_LOADS) return;
        autoLoadCountRef.current += 1;
        fetchNextPage();
      },
      { rootMargin: "600px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [sessionKey, feedStatus, fetchNextPage, rawCount]);

  const handleManualLoadMore = () => {
    autoLoadCountRef.current = 0;
    prevRawRef.current = rawCount;
    fetchNextPage();
  };

  const handlers: DiscoveryCardHandlers = {
    onAskAstra: (item) => {
      record.mutate({ itemRef: item.itemRef, kind: "research" });
      router.push(`/app/threads?seed=${encodeURIComponent(buildSeed(item))}`);
    },
    onSaved: (item) => record.mutate({ itemRef: item.itemRef, kind: "save" }),
    onHide: (item) => {
      const key = discoveryItemKey(item);
      setHiddenIds((prev) => new Set(prev).add(key));
      hide.mutate(item.itemRef, { onError: () => toast.error("Gagal menyembunyikan.") });
    },
  };

  const showMosaic = !searchActive;
  const hero = showMosaic ? allItems[0] : undefined;
  const briefRows = showMosaic ? buildBriefRows(allItems.slice(1)) : [];

  return (
    <div className="@container/explore min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-border/70 bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center gap-4 px-5 sm:px-8 xl:px-10">
          <span className="shrink-0 font-heading text-[15px] font-bold text-foreground">Jelajahi</span>
          <div className="flex-1">
            <DiscoveryModeNav
              mode={mode}
              topic={topic}
              onSelectMode={(m) => {
                setMode(m);
                setTopic(null);
              }}
              onSelectTopic={(t) => {
                setMode("topics");
                setTopic(t);
              }}
            />
          </div>
          <DiscoveryHeaderControls
            query={q}
            onSubmitQuery={setQ}
            range={range}
            onRangeChange={setRange}
            isSearching={searchActive && (searchQuery.isFetching || searchQuery.isPending || externalPending)}
          />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1200px] px-5 pb-12 pt-4 sm:px-8 xl:px-10">
        {searchActive ? <SearchResultsHeader query={q} onClear={() => setQ("")} /> : null}

        {active.isError ? (
          <div className="mt-4 max-w-[760px] rounded-[7px] border border-destructive/20 bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive">
            {readableApiErrorMessage(active.error, "Gagal memuat.")}
          </div>
        ) : null}

        <section className="grid grid-cols-1 gap-8 pt-6 @4xl/explore:grid-cols-[minmax(0,1fr)_340px] @4xl/explore:gap-10">
        <div className="@container/feed min-w-0">
          {isLoadingFirst ? (
            <Loader />
          ) : allItems.length === 0 && feedStatus === "Exhausted" && !externalPending ? (
            <DiscoveryEmptyState mode={searchActive ? "search" : mode} query={q} />
          ) : showMosaic ? (
            <div className="space-y-10">
              {hero ? <DiscoveryHeroCard item={hero} busy={false} handlers={handlers} /> : null}
              {briefRows.map((row) =>
                row.type === "grid" ? (
                  <div key={row.key} className="grid grid-cols-1 gap-x-5 gap-y-8 @md/feed:grid-cols-2 @2xl/feed:grid-cols-3">
                    {row.items.map((item) => (
                      <div key={discoveryItemKey(item)}>
                        <DiscoveryStandardCard item={item} busy={false} handlers={handlers} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div key={row.key} className="border-t border-border/60 pt-10">
                    <DiscoveryFeatureCard item={row.item} imageSide={row.side} busy={false} handlers={handlers} />
                  </div>
                ),
              )}
              {feedStatus !== "Exhausted" ? <div ref={sentinelRef} aria-hidden className="h-px w-full" /> : null}
              <FeedFooter status={feedStatus} caughtUp onLoadMore={handleManualLoadMore} />
            </div>
          ) : (
            <div>
              <div className="divide-y divide-border/60">
                {allItems.map((item, index) => (
                  <DiscoveryListItem key={discoveryItemKey(item)} item={item} index={index} busy={false} handlers={handlers} />
                ))}
              </div>
              {feedStatus !== "Exhausted" ? <div ref={sentinelRef} aria-hidden className="h-px w-full" /> : null}
              {externalPending ? <Loader /> : <FeedFooter status={feedStatus} caughtUp={false} onLoadMore={handleManualLoadMore} />}
              {searchBlocked ? (
                <p className="py-4 text-center text-[12.5px] font-medium text-muted-foreground">
                  Kuota pencarian web habis; hasil dari indeks ditampilkan. Kuota pulih berkala.
                </p>
              ) : null}
            </div>
          )}
        </div>

        <aside className="min-w-0 @4xl/explore:sticky @4xl/explore:top-20 @4xl/explore:self-start">
          <DiscoveryAside topCited={topCited} />
        </aside>
        </section>
      </main>
    </div>
  );
}

// Seed teks untuk Tanya Astra: judul + tldr + sumber.
function buildSeed(item: DiscoveryItem): string {
  return `${item.title}\n\n${item.tldr ?? item.summary}\n\nSumber: ${item.resolvedUrl ?? item.url}`;
}

type FeedStatus = "LoadingMore" | "CanLoadMore" | "Exhausted";

type BriefRow =
  | { type: "grid"; key: string; items: DiscoveryItem[] }
  | { type: "feature"; key: string; item: DiscoveryItem; side: "left" | "right" };

// Editorial mosaic: repeating 3-up standard grid + full-width spotlight
// (alternating image side), matching the magazine rhythm of the redesign.
function buildBriefRows(items: DiscoveryItem[]): BriefRow[] {
  const rows: BriefRow[] = [];
  let bucket: DiscoveryItem[] = [];
  let featureCount = 0;

  const flush = () => {
    if (bucket.length > 0) {
      rows.push({ type: "grid", key: `grid-${discoveryItemKey(bucket[0])}`, items: bucket });
      bucket = [];
    }
  };

  items.forEach((item, index) => {
    if (index % 5 < 3) {
      bucket.push(item);
    } else {
      flush();
      rows.push({
        type: "feature",
        key: `feature-${discoveryItemKey(item)}`,
        item,
        side: featureCount % 2 === 0 ? "right" : "left",
      });
      featureCount += 1;
    }
  });
  flush();
  return rows;
}

function Loader() {
  return (
    <div className="flex items-center justify-center py-10 text-muted-foreground">
      <Loader2Icon className="animate-spin" />
    </div>
  );
}

function FeedFooter({ status, caughtUp, onLoadMore }: { status: FeedStatus; caughtUp: boolean; onLoadMore: () => void }) {
  if (status === "Exhausted") return caughtUp ? <CaughtUp /> : null;
  if (status === "LoadingMore")
    return (
      <div className="flex items-center justify-center py-8 text-[12.5px] font-medium text-muted-foreground">
        Memuat lebih banyak…
      </div>
    );
  return (
    <div className="flex justify-center py-8">
      <button
        type="button"
        onClick={onLoadMore}
        className="inline-flex h-9 items-center rounded-[8px] border border-border/80 px-4 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted"
      >
        Muat lebih banyak
      </button>
    </div>
  );
}

function CaughtUp() {
  return (
    <div className="mt-8 flex flex-col items-center gap-2 border-t border-border/60 py-10 text-center">
      <div className="flex size-9 items-center justify-center rounded-full bg-mint-soft text-mint-foreground">
        <CheckCircle2Icon className="size-5" />
      </div>
      <p className="text-[14px] font-semibold text-foreground">Kamu sudah update</p>
      <p className="max-w-[320px] text-[12.5px] text-muted-foreground">
        Itu semua untuk sekarang. Feed disegarkan berkala, kembali lagi nanti atau simpan beberapa item untuk diteliti.
      </p>
    </div>
  );
}

function SearchResultsHeader({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-3 pt-2">
      <p className="text-[13px] font-medium text-muted-foreground">
        Hasil untuk <span className="font-semibold text-foreground">“{query.trim()}”</span>
      </p>
      <button
        type="button"
        onClick={onClear}
        className="inline-flex h-8 items-center rounded-[8px] border border-border/80 px-2.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        Hapus pencarian
      </button>
    </div>
  );
}

function DiscoveryEmptyState({ mode, query }: { mode: string; query: string }) {
  const message =
    mode === "search"
      ? `Tidak ada hasil untuk “${query.trim()}”. Coba kata kunci lain atau perlebar rentang waktu.`
      : mode === "topics"
        ? "Belum ada konten untuk topik ini. Coba topik lain atau kembali nanti."
        : "Konten untuk lajur ini akan muncul setelah penyegaran terjadwal berikutnya.";
  return (
    <div className="mt-2 max-w-[560px] rounded-[10px] border border-border bg-card px-5 py-8 text-center">
      <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-mint-soft text-mint-foreground">
        <SparklesIcon className="size-5" />
      </div>
      <h3 className="text-[15px] font-semibold text-foreground">{mode === "search" ? "Tidak ada hasil" : "Belum ada item"}</h3>
      <p className="mx-auto mt-1.5 max-w-[380px] text-[13px] font-medium leading-5 text-muted-foreground">{message}</p>
    </div>
  );
}

"use client";

// Zona 4 · "Temuan untukmu" — feed nyata gabungan paper + berita, memakai kartu
// discovery yang sudah ada (DiscoveryHeroCard featured + grid DiscoveryStandardCard)
// + useFeedInfinite + infinite scroll. Di-scope oleh interest pill aktif (topic).

import { CheckCircle2Icon, Loader2Icon, SparklesIcon } from "@aqsha/ui/icons";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  DiscoveryFeatureCard,
  DiscoveryHeroCard,
  DiscoveryStandardCard,
  type DiscoveryCardHandlers,
} from "@/features/discovery/components/discovery-item-card";
import { HouseAdBanner } from "@/features/discovery/components/house-ad-banner";
import { HOUSE_ADS, type HouseAd } from "@/features/discovery/house-ads";
import {
  useFeedInfinite,
  useHideDiscovery,
  useRecordInteraction,
  useSearchDiscovery,
} from "@/features/discovery/api";
import {
  discoveryItemKey,
  feedItemToDiscoveryItem,
  type DiscoveryItem,
} from "@/features/discovery/model";
import type { FeedItem, FeedTopic } from "@/features/discovery/types";
import { readableApiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { SectionHeader } from "./section-header";

type FeedStatus = "LoadingMore" | "CanLoadMore" | "Exhausted";

// Bound auto-loads between scrolls so a run of locally-hidden items can't spin.
const MAX_AUTO_LOADS = 4;

export function ExploreFindings({ topic, query }: { topic: FeedTopic | null; query: string }) {
  const router = useRouter();
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());

  const q = query.trim();
  const searchMode = q.length > 0;
  const mode = topic ? "topics" : "foryou";
  // Query disubmit → feed switch ke hasil pencarian (paper+news); kosong → feed personal.
  const feedQuery = useFeedInfinite(mode, topic, !searchMode);
  const searchQuery = useSearchDiscovery(q);
  const feed = searchMode ? searchQuery : feedQuery;
  const hide = useHideDiscovery();
  const record = useRecordInteraction();

  // Flatten → dedupe → drop locally-hidden (auto-memoized by React Compiler).
  const items: DiscoveryItem[] = [];
  {
    const seen = new Set<string>();
    for (const page of feed.data?.pages ?? []) {
      for (const raw of page.items as FeedItem[]) {
        if (seen.has(raw._id)) continue;
        seen.add(raw._id);
        const item = feedItemToDiscoveryItem(raw);
        if (!hiddenIds.has(discoveryItemKey(item))) items.push(item);
      }
    }
  }
  const rawCount = (feed.data?.pages ?? []).reduce((n, p) => n + p.items.length, 0);

  const fetchNextPage = feed.fetchNextPage;
  const feedStatus: FeedStatus = feed.isFetchingNextPage
    ? "LoadingMore"
    : feed.hasNextPage
      ? "CanLoadMore"
      : "Exhausted";

  // Infinite-scroll budget (mirror discovery-page.tsx).
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const autoLoadCountRef = useRef(0);
  const prevRawRef = useRef(0);
  const sessionKey = searchMode ? `explore:search:${q}` : `explore:${mode}:${topic ?? ""}`;

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

  const hero = items[0];
  const rest = items.slice(1);

  return (
    <section className={searchMode ? "pt-16" : "pt-8"}>
      {searchMode ? (
        <SectionHeader
          title={`Hasil untuk “${q}”`}
          subtitle="Paper & berita yang cocok dengan pencarianmu"
          right={<span className="shrink-0 font-mono text-[11px] text-muted-foreground">{items.length} item</span>}
        />
      ) : null}

      <div
        className={cn(
          searchMode ? "@container/feed mt-5" : "@container/feed",
          // Hasil lama tetap tampil (di-fade) selagi kueri/topik baru dimuat — transisi mulus.
          feed.isPlaceholderData && "opacity-60 transition-opacity duration-200",
        )}
      >
        {feed.isError ? (
          <div className="max-w-[760px] rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive">
            {readableApiErrorMessage(feed.error, "Gagal memuat.")}
          </div>
        ) : feed.isPending ? (
          <Loader />
        ) : items.length === 0 ? (
          <EmptyState topic={topic} searchQuery={searchMode ? q : null} />
        ) : (
          <div className="space-y-10">
            {hero ? (
              <DiscoveryHeroCard key={discoveryItemKey(hero)} item={hero} busy={false} handlers={handlers} />
            ) : null}
            {buildFeedBlocks(rest, !searchMode).map((block) => {
              if (block.kind === "grid") {
                return (
                  <div
                    key={block.key}
                    className="grid grid-cols-1 gap-x-5 gap-y-8 @md/feed:grid-cols-2 @2xl/feed:grid-cols-3"
                  >
                    {block.items.map((item, idx) => (
                      <div
                        key={discoveryItemKey(item)}
                        className="animate-in duration-300 ease-out fade-in-0 slide-in-from-bottom-2"
                        style={{ animationDelay: `${Math.min(idx, 8) * 40}ms` }}
                      >
                        <DiscoveryStandardCard item={item} busy={false} handlers={handlers} />
                      </div>
                    ))}
                  </div>
                );
              }
              if (block.kind === "feature") {
                return (
                  <div
                    key={block.key}
                    className="animate-in duration-300 ease-out fade-in-0 slide-in-from-bottom-2"
                  >
                    <DiscoveryFeatureCard
                      item={block.item}
                      imageSide={block.side}
                      busy={false}
                      handlers={handlers}
                    />
                  </div>
                );
              }
              return (
                <div key={block.key} className="animate-in duration-300 ease-out fade-in-0">
                  <HouseAdBanner ad={block.ad} />
                </div>
              );
            })}
            {feedStatus !== "Exhausted" ? <div ref={sentinelRef} aria-hidden className="h-px w-full" /> : null}
            <FeedFooter status={feedStatus} onLoadMore={handleManualLoadMore} />
          </div>
        )}
      </div>
    </section>
  );
}

function buildSeed(item: DiscoveryItem): string {
  return `${item.title}\n\n${item.tldr ?? item.summary}\n\nSumber: ${item.resolvedUrl ?? item.url}`;
}

// Ritme feed editorial (opsi 4): grid 3-up tiap GRID_CHUNK item, lalu 1 feature
// full-width (selang-seling kiri/kanan). House-ad (opsi 2) diselipkan setelah grid
// pertama lalu tiap AD_CADENCE grid berikutnya, menarik kampanye berurutan dari
// HOUSE_ADS sampai habis → menambah entri ke array otomatis ikut tampil (non-search
// only). Hero (items[0]) dirender terpisah di atas.
type FeedBlock =
  | { kind: "grid"; key: string; items: DiscoveryItem[] }
  | { kind: "feature"; key: string; item: DiscoveryItem; side: "left" | "right" }
  | { kind: "ad"; key: string; ad: HouseAd };

const GRID_CHUNK = 6;
const AD_FIRST_AFTER_GRID = 1;
const AD_CADENCE = 2;

function buildFeedBlocks(rest: DiscoveryItem[], includeAds: boolean): FeedBlock[] {
  const blocks: FeedBlock[] = [];
  let p = 0;
  let gridN = 0;
  let adN = 0;
  while (p < rest.length) {
    const chunk = rest.slice(p, p + GRID_CHUNK);
    p += chunk.length;
    blocks.push({ kind: "grid", key: `grid-${gridN}`, items: chunk });
    gridN += 1;
    if (
      includeAds &&
      adN < HOUSE_ADS.length &&
      gridN >= AD_FIRST_AFTER_GRID &&
      (gridN - AD_FIRST_AFTER_GRID) % AD_CADENCE === 0
    ) {
      blocks.push({ kind: "ad", key: `ad-${HOUSE_ADS[adN]!.id}`, ad: HOUSE_ADS[adN]! });
      adN += 1;
    }
    if (p < rest.length) {
      const item = rest[p]!;
      p += 1;
      // featN ≡ gridN-1 di tiap feature-push → sisi selang-seling tanpa counter terpisah.
      blocks.push({
        kind: "feature",
        key: `feature-${discoveryItemKey(item)}`,
        item,
        side: (gridN - 1) % 2 === 0 ? "left" : "right",
      });
    }
  }
  return blocks;
}

function Loader() {
  return (
    <div className="flex items-center justify-center py-10 text-muted-foreground">
      <Loader2Icon className="animate-spin" />
    </div>
  );
}

function FeedFooter({ status, onLoadMore }: { status: FeedStatus; onLoadMore: () => void }) {
  if (status === "Exhausted") {
    return (
      <div className="mt-8 flex flex-col items-center gap-2 border-t border-border/60 py-10 text-center">
        <div className="flex size-9 items-center justify-center rounded-full bg-mint-soft text-mint-foreground">
          <CheckCircle2Icon className="size-5" />
        </div>
        <p className="text-[14px] font-semibold text-foreground">Kamu sudah baca semua</p>
        <p className="max-w-[320px] text-[12.5px] text-muted-foreground">
          Segini dulu untuk saat ini. Feed diperbarui berkala — simpan beberapa item untuk diteliti.
        </p>
      </div>
    );
  }
  if (status === "LoadingMore") {
    return (
      <div className="flex items-center justify-center py-8 text-[12.5px] font-medium text-muted-foreground">
        Memuat lebih banyak…
      </div>
    );
  }
  return (
    <div className="flex justify-center py-8">
      <button
        type="button"
        onClick={onLoadMore}
        className="inline-flex h-9 items-center rounded-full border border-border/80 bg-secondary px-5 font-mono text-[12px] text-muted-foreground transition-colors hover:border-muted-foreground/40 hover:text-foreground"
      >
        Muat lagi ↓
      </button>
    </div>
  );
}

function EmptyState({ topic, searchQuery }: { topic: FeedTopic | null; searchQuery: string | null }) {
  return (
    <div className="max-w-[560px] rounded-2xl border border-border bg-card px-5 py-8 text-center">
      <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-mint-soft text-mint-foreground">
        <SparklesIcon className="size-5" />
      </div>
      <h3 className="text-[15px] font-semibold text-foreground">
        {searchQuery ? "Tak ada hasil" : "Belum ada item"}
      </h3>
      <p className="mx-auto mt-1.5 max-w-[380px] text-[13px] font-medium leading-5 text-muted-foreground">
        {searchQuery
          ? `Tak ada paper atau berita yang cocok dengan “${searchQuery}”. Coba kata kunci lain.`
          : topic
            ? "Belum ada konten untuk bidang ini. Coba bidang lain atau kembali setelah pembaruan berikutnya."
            : "Konten akan muncul setelah pembaruan terjadwal berikutnya."}
      </p>
    </div>
  );
}

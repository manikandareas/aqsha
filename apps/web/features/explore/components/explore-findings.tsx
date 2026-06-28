"use client";

// Zona 4 · "Temuan untukmu" — feed nyata gabungan paper + berita, memakai kartu
// discovery yang sudah ada (DiscoveryHeroCard featured + grid DiscoveryStandardCard)
// + useFeedInfinite + infinite scroll. Di-scope oleh interest pill aktif (topic).

import { CheckCircle2Icon, Loader2Icon, SparklesIcon } from "@aqsha/ui/icons";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  DiscoveryHeroCard,
  DiscoveryStandardCard,
  type DiscoveryCardHandlers,
} from "@/features/discovery/components/discovery-item-card";
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
    <section className="pt-16">
      <SectionHeader
        title={searchMode ? `Hasil untuk “${q}”` : "Temuan untukmu"}
        subtitle={searchMode ? "Paper & berita yang cocok dengan pencarianmu" : "Scroll terus untuk paper & berita berikutnya"}
        right={<span className="shrink-0 font-mono text-[11px] text-muted-foreground">{items.length} item</span>}
      />

      <div className="@container/feed mt-5">
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
            {hero ? <DiscoveryHeroCard item={hero} busy={false} handlers={handlers} /> : null}
            {rest.length > 0 ? (
              <div className="grid grid-cols-1 gap-x-5 gap-y-8 @md/feed:grid-cols-2 @2xl/feed:grid-cols-3">
                {rest.map((item, idx) => (
                  <div
                    key={discoveryItemKey(item)}
                    className="animate-in duration-300 ease-out fade-in-0 slide-in-from-bottom-2"
                    style={{ animationDelay: `${Math.min(idx, 8) * 40}ms` }}
                  >
                    <DiscoveryStandardCard item={item} busy={false} handlers={handlers} />
                  </div>
                ))}
              </div>
            ) : null}
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

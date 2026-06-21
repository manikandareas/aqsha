"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@aqsha/ui/components/button";
import { Input } from "@aqsha/ui/components/input";
import { Loader2Icon } from "@aqsha/ui/icons";
import { readableApiErrorMessage } from "@/lib/api-error";
import { useFeedInfinite, useSearchDiscovery } from "../api";
import {
  FEED_TOPIC_LABELS,
  type FeedItem,
  type FeedMode,
  type FeedTopic,
} from "../types";
import { FeedCard } from "./feed-card";

const MODES: { id: FeedMode; label: string }[] = [
  { id: "foryou", label: "Untukmu" },
  { id: "top", label: "Teratas" },
  { id: "topics", label: "Topik" },
];
const TOPICS = Object.keys(FEED_TOPIC_LABELS) as FeedTopic[];

/**
 * Surface utama /app/explore. Nav For You/Top/Topics + sub-nav topik + infinite scroll otomatis.
 * Search box global (tsvector) menggantikan feed saat `q` non-kosong. Save/hide + reader internal
 * sudah aktif (4.3/4.4). Live external augmentation (paper uncached) = Fase 8.
 */
export function DiscoveryPage() {
  const [mode, setMode] = useState<FeedMode>("foryou");
  const [topic, setTopic] = useState<FeedTopic>("sains_teknologi");
  const [search, setSearch] = useState("");
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const activeTopic = mode === "topics" ? topic : null;
  const searching = search.trim().length > 0;

  const feedQuery = useFeedInfinite(mode, activeTopic);
  const searchQuery = useSearchDiscovery(search);
  const query = searching ? searchQuery : feedQuery;

  const items = useMemo(() => {
    const seen = new Set<string>();
    const out: FeedItem[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const item of page.items) {
        if (seen.has(item._id) || hiddenIds.has(item._id)) continue;
        seen.add(item._id);
        out.push(item);
      }
    }
    return out;
  }, [query.data, hiddenIds]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const fetchNextPage = query.fetchNextPage;
  const hasNextPage = query.hasNextPage;
  const isFetchingNextPage = query.isFetchingNextPage;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "600px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <div>
        <h1 className="font-serif text-3xl">Jelajahi</h1>
        <p className="text-sm text-muted-foreground">
          Paper, berita sains, dan klaim terverifikasi — dipersonalisasi dari minatmu.
        </p>
      </div>

      <div className="mt-5">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari paper, berita, klaim…"
          aria-label="Cari konten discovery"
        />
      </div>

      {!searching ? (
        <>
          <nav className="mt-5 flex gap-1">
            {MODES.map((m) => (
              <Button
                key={m.id}
                variant={mode === m.id ? "default" : "ghost"}
                size="sm"
                onClick={() => setMode(m.id)}
              >
                {m.label}
              </Button>
            ))}
          </nav>
          {mode === "topics" ? (
            <div className="mt-3 flex flex-wrap gap-1">
              {TOPICS.map((t) => (
                <Button
                  key={t}
                  variant={topic === t ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setTopic(t)}
                >
                  {FEED_TOPIC_LABELS[t]}
                </Button>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Hasil pencarian untuk “{search.trim()}”
        </p>
      )}

      {query.isPending && (!searching || searchQuery.isFetching) ? (
        <Loader />
      ) : query.isError ? (
        <p className="py-16 text-center text-sm text-destructive">
          {readableApiErrorMessage(query.error, "Gagal memuat.")}
        </p>
      ) : items.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          {searching
            ? "Tidak ada hasil. Coba kata kunci lain."
            : "Belum ada konten. Jalankan hidrasi feed untuk mengisi feed."}
        </p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {items.map((item) => (
            <li key={item._id}>
              <FeedCard
                item={item}
                onHidden={(id) => setHiddenIds((prev) => new Set(prev).add(id))}
              />
            </li>
          ))}
        </ul>
      )}

      <div ref={sentinelRef} className="h-px" />
      {isFetchingNextPage ? <Loader /> : null}
    </main>
  );
}

function Loader() {
  return (
    <div className="flex justify-center py-6 text-muted-foreground">
      <Loader2Icon className="animate-spin" />
    </div>
  );
}

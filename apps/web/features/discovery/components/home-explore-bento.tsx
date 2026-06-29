"use client";

// Teaser discovery di /app (bawah composer). Satu beat singkat — sliver feed asli
// (1 hero + 2 grid) pakai kartu editorial yang sama dengan Explore + topic pills
// (deep-link) — cukup buat memancing scroll lalu menyalurkan ke /app/explore.

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowUpRightIcon } from "@aqsha/ui/icons";
import { useSetAmbientContextRefs } from "@/features/thread-experience/components/composer-context-mentions";
import { SectionHeader } from "@/features/explore/components/section-header";
import { useFeedHome, useHideDiscovery, useRecordInteraction } from "../api";
import { discoveryItemToContextRef } from "../ask-astra";
import { DISCOVERY_TOPICS } from "../nav";
import {
  DiscoveryHeroCard,
  DiscoveryStandardCard,
  type DiscoveryCardHandlers,
} from "./discovery-item-card";
import { discoveryItemKey, feedItemToDiscoveryItem } from "../model";
import { FEED_TOPIC_LABELS } from "../types";

const PILLS = [
  { label: "Semua", href: "/app/explore" },
  ...DISCOVERY_TOPICS.map((t) => ({ label: FEED_TOPIC_LABELS[t], href: `/app/explore?topic=${t}` })),
];

export function HomeExploreBento() {
  const query = useFeedHome();
  const hide = useHideDiscovery();
  const record = useRecordInteraction();
  const setAmbientContextRefs = useSetAmbientContextRefs();
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());

  const items = (query.data ?? [])
    .map(feedItemToDiscoveryItem)
    .filter((it) => !hiddenIds.has(discoveryItemKey(it)))
    .slice(0, 3);
  const hero = items[0];
  const rest = items.slice(1);
  const showFeed = !query.isPending && items.length > 0;

  const handlers: DiscoveryCardHandlers = {
    onAskAstra: (item) => {
      record.mutate({ itemRef: item.itemRef, kind: "research" });
      // Landing /app: composer ada inline → sematkan item sebagai token konteks (bukan seed nav).
      const ref = discoveryItemToContextRef(item);
      if (ref) setAmbientContextRefs([ref]);
    },
    onSaved: (item) => record.mutate({ itemRef: item.itemRef, kind: "save" }),
    onHide: (item) => {
      const key = discoveryItemKey(item);
      setHiddenIds((prev) => new Set(prev).add(key));
      hide.mutate(item.itemRef, { onError: () => toast.error("Gagal menyembunyikan.") });
    },
  };

  if (!showFeed) return null;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-20 pt-4 sm:px-8">
      {/* Jelajahi — sliver feed asli */}
      <section>
        <SectionHeader
          title="Jelajahi"
          subtitle="Paper & berita pilihan buat kamu"
          right={
            <Link
              href="/app/explore"
              className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Lihat semua <ArrowUpRightIcon className="size-3.5" />
            </Link>
          }
        />

        <div className="mt-4 flex flex-wrap gap-2">
          {PILLS.map((pill) => (
            <Link
              key={pill.href}
              href={pill.href}
              className="rounded-full border border-border bg-card px-4 py-2 text-[13px] font-medium text-muted-foreground transition-all hover:-translate-y-0.5 hover:border-muted-foreground/40 hover:text-foreground"
            >
              {pill.label}
            </Link>
          ))}
        </div>

        <div className="@container/feed mt-7 space-y-9">
          {hero ? (
            <DiscoveryHeroCard key={discoveryItemKey(hero)} item={hero} busy={false} handlers={handlers} />
          ) : null}
          {rest.length > 0 ? (
            <div className="grid grid-cols-1 gap-x-5 gap-y-8 @md/feed:grid-cols-2">
              {rest.map((item) => (
                <DiscoveryStandardCard
                  key={discoveryItemKey(item)}
                  item={item}
                  busy={false}
                  handlers={handlers}
                />
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

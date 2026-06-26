"use client";

// Teaser discovery di /app (bawah composer). Dua beat yang sengaja singkat —
// cukup buat memancing scroll lalu menyalurkan ke /app/explore:
//   Beat 1 "Jelajahi"      — sliver feed asli (1 hero + 2 grid) pakai kartu editorial
//                            yang sama dengan Explore + topic pills (deep-link).
//   Beat 2 "Bukan cuma feed" — strip undangan STATIK ke 3 alat khas Explore
//                            (globe / celah riset / tarik-ulur bukti). Tanpa job,
//                            tanpa facets/analysis/Mapbox → murah & selalu tampil.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowUpRightIcon, GlobeIcon, Scale, TelescopeIcon } from "@aqsha/ui/icons";
import { SectionHeader } from "@/features/explore/components/section-header";
import { cn } from "@/lib/utils";
import { useFeedHome, useHideDiscovery, useRecordInteraction } from "../api";
import { DISCOVERY_TOPICS } from "../nav";
import {
  DiscoveryHeroCard,
  DiscoveryStandardCard,
  type DiscoveryCardHandlers,
} from "./discovery-item-card";
import {
  discoveryItemKey,
  feedItemToDiscoveryItem,
  type DiscoveryItem,
} from "../model";
import { FEED_TOPIC_LABELS } from "../types";

const PILLS = [
  { label: "Semua", href: "/app/explore" },
  ...DISCOVERY_TOPICS.map((t) => ({ label: FEED_TOPIC_LABELS[t], href: `/app/explore?topic=${t}` })),
];

// Strip undangan: tiap tile = link statik ke Explore (alat ini query-driven di sana,
// jadi di home cukup digoda, tidak dijalankan).
const TEASERS: { icon: typeof GlobeIcon; title: string; desc: string; chip: string }[] = [
  {
    icon: GlobeIcon,
    title: "Peta kolaborasi global",
    desc: "Negara mana yang paling aktif meneliti satu topik.",
    chip: "bg-sky-soft text-sky-foreground",
  },
  {
    icon: TelescopeIcon,
    title: "Celah riset",
    desc: "Pertanyaan yang belum banyak dijawab — siap kamu garap.",
    chip: "bg-mint-soft text-mint-foreground",
  },
  {
    icon: Scale,
    title: "Tarik-ulur bukti",
    desc: "Klaim yang saling mendukung dan membantah, dengan sitasi.",
    chip: "bg-coral-soft text-coral-foreground",
  },
];

export function HomeExploreBento() {
  const router = useRouter();
  const query = useFeedHome();
  const hide = useHideDiscovery();
  const record = useRecordInteraction();
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
      router.push(`/app/threads?seed=${encodeURIComponent(buildSeed(item))}`);
    },
    onSaved: (item) => record.mutate({ itemRef: item.itemRef, kind: "save" }),
    onHide: (item) => {
      const key = discoveryItemKey(item);
      setHiddenIds((prev) => new Set(prev).add(key));
      hide.mutate(item.itemRef, { onError: () => toast.error("Gagal menyembunyikan.") });
    },
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-20 pt-4 sm:px-8">
      {/* Beat 1 · Jelajahi — sliver feed asli */}
      {showFeed ? (
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
            {hero ? <DiscoveryHeroCard item={hero} busy={false} handlers={handlers} /> : null}
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
      ) : null}

      {/* Beat 2 · Bukan cuma feed — strip undangan ke alat khas Explore */}
      <section className={cn(showFeed && "pt-16")}>
        <SectionHeader title="Bukan cuma feed" subtitle="Alat eksplorasi yang cuma ada di Jelajahi" />
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {TEASERS.map((t) => (
            <Link
              key={t.title}
              href="/app/explore"
              className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-muted-foreground/40 hover:shadow-sm"
            >
              <span className={cn("flex size-9 items-center justify-center rounded-xl", t.chip)}>
                <t.icon className="size-[18px]" />
              </span>
              <div>
                <p className="flex items-center gap-1 font-heading text-[15px] font-bold tracking-tight text-foreground">
                  {t.title}
                  <ArrowUpRightIcon className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </p>
                <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{t.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function buildSeed(item: DiscoveryItem): string {
  return `${item.title}\n\n${item.tldr ?? item.summary}\n\nSumber: ${item.resolvedUrl ?? item.url}`;
}

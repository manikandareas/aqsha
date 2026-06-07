"use client";

import {
  BookmarkIcon,
  ChevronRightIcon,
  CompassIcon,
  SparklesIcon,
} from "@aqsha/ui/icons";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { TopTopic } from "../utils/discovery-format";
import type { DiscoveryFeedItem } from "./discovery-item-card";
import { VerdictBadge } from "./discovery-visuals";

// The fixed second sidebar for the discovery surface. A column of light
// single-level modules (no nested cards): start-from-a-topic, trending,
// saved, and a latest fact-check spotlight.
export function DiscoveryAside({
  topTopics,
  saved,
  latestClaim,
  lang,
  onStartTopic,
  onOpenClaim,
}: {
  topTopics: TopTopic[];
  saved: Array<{ _id: string; title: string }>;
  latestClaim?: DiscoveryFeedItem;
  lang: "id" | "en";
  onStartTopic: (topic: string) => void;
  onOpenClaim: (item: DiscoveryFeedItem) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <TopicModule onSubmit={onStartTopic} />
      {latestClaim?.claim ? (
        <ClaimModule item={latestClaim} lang={lang} onOpen={onOpenClaim} />
      ) : null}
      {topTopics.length > 0 ? <TrendingModule topTopics={topTopics} /> : null}
      <SavedModule saved={saved} />
    </div>
  );
}

function ModuleShell({
  title,
  icon,
  action,
  children,
  className,
}: {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-[14px] border border-border bg-card p-4", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
          {icon}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function TopicModule({ onSubmit }: { onSubmit: (topic: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <section className="rounded-[14px] border border-mint-soft-border bg-mint-soft/50 p-4">
      <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
        <CompassIcon className="size-4" /> Mulai dari topik
      </h2>
      <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
        Tulis topik apa pun — Aqsha menambang celah riset & menyusun pertanyaan
        yang layak diteliti.
      </p>
      <form
        className="mt-3 flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const topic = value.trim();
          if (!topic) return;
          onSubmit(topic);
          setValue("");
        }}
      >
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="mis. mikroplastik di air minum"
          className="h-9 w-full rounded-[8px] border border-border bg-background px-3 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={!value.trim()}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[8px] bg-primary px-4 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          <SparklesIcon className="size-4" /> Hasilkan pertanyaan
        </button>
      </form>
    </section>
  );
}

function ClaimModule({
  item,
  lang,
  onOpen,
}: {
  item: DiscoveryFeedItem;
  lang: "id" | "en";
  onOpen: (item: DiscoveryFeedItem) => void;
}) {
  const title = lang === "id" ? item.titleId ?? item.title : item.title;
  return (
    <ModuleShell title="Cek fakta terbaru">
      {item.claim ? <VerdictBadge verdict={item.claim.verdict} /> : null}
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="mt-2 block text-left text-[13px] font-medium leading-snug text-foreground underline-offset-2 hover:underline"
      >
        {title}
      </button>
      {item.claim?.publisher ? (
        <p className="mt-1 text-[11.5px] text-muted-foreground">
          Diperiksa {item.claim.publisher}
        </p>
      ) : null}
    </ModuleShell>
  );
}

function TrendingModule({ topTopics }: { topTopics: TopTopic[] }) {
  return (
    <ModuleShell title="Sedang ramai">
      <ol className="space-y-3">
        {topTopics.map((topic, index) => (
          <li
            key={topic.name}
            className="flex items-center justify-between gap-4 text-[13px] font-medium"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="w-4 shrink-0 text-right font-mono text-[11px] text-muted-foreground/60">
                {index + 1}
              </span>
              <span className="truncate text-muted-foreground">{topic.name}</span>
            </span>
            <span className="font-mono text-[11px] text-muted-foreground/80">
              {topic.count}
            </span>
          </li>
        ))}
      </ol>
    </ModuleShell>
  );
}

function SavedModule({
  saved,
}: {
  saved: Array<{ _id: string; title: string }>;
}) {
  return (
    <ModuleShell
      title="Tersimpan"
      icon={<BookmarkIcon className="size-3.5" />}
      action={
        saved.length > 0 ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            {saved.length}
            <ChevronRightIcon className="size-3" />
          </span>
        ) : null
      }
    >
      {saved.length === 0 ? (
        <p className="text-[12.5px] leading-5 text-muted-foreground">
          Simpan item untuk membangun koleksi ide & mempertajam relevansi feed.
        </p>
      ) : (
        <ul className="space-y-3">
          {saved.slice(0, 6).map((row) => (
            <li
              key={row._id}
              className="line-clamp-2 text-[12.5px] font-medium leading-snug text-muted-foreground"
            >
              {row.title}
            </li>
          ))}
        </ul>
      )}
    </ModuleShell>
  );
}

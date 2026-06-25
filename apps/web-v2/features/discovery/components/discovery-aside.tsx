"use client";

import { ArrowUpRightIcon, GaugeIcon, Quote, SparklesIcon, TrendingUpIcon } from "@aqsha/ui/icons";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { TopCitedPaper, TopicMomentum, TopTopic, VerdictBreakdown } from "../aggregate";
import { formatCitationCount, VERDICT_FILL, VERDICT_STYLE } from "../format";
import { feedDetailHref } from "../model";
import type { FeedMode } from "../types";
import { Donut, Sparkline } from "./discovery-visuals";

// Fixed right rail: a lean widget deck derived entirely from the loaded items.
// Modules self-hide without data. Fact balance shows on For You; the middle slot
// prefers topic momentum and falls back to most-cited; trending always shows.
export function DiscoveryAside({
  mode,
  verdicts,
  momentum,
  topTopics,
  topCited,
  onSelectTopic,
}: {
  mode: FeedMode;
  verdicts: VerdictBreakdown;
  momentum: TopicMomentum[];
  topTopics: TopTopic[];
  topCited: TopCitedPaper[];
  onSelectTopic: (name: string) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      {mode === "foryou" ? <FactBalanceModule verdicts={verdicts} /> : null}
      {momentum.length > 0 ? (
        <MomentumModule momentum={momentum} onSelectTopic={onSelectTopic} />
      ) : (
        <MostCitedModule topCited={topCited} />
      )}
      <TrendingModule topTopics={topTopics} onSelectTopic={onSelectTopic} />
    </div>
  );
}

function SectionHeader({ title, icon }: { title: string; icon?: ReactNode }) {
  return (
    <h2 className="mb-3 flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
      {icon}
      {title}
    </h2>
  );
}

function WidgetCard({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-[14px] border border-border bg-card p-4", className)}>{children}</section>;
}

function FactBalanceModule({ verdicts }: { verdicts: VerdictBreakdown }) {
  if (verdicts.total === 0) return null;
  return (
    <WidgetCard>
      <SectionHeader title="Timbangan fakta hari ini" icon={<GaugeIcon className="size-3.5" />} />
      <div className="flex items-center gap-4">
        <Donut
          total={verdicts.total}
          size={92}
          centerLabel={String(verdicts.total)}
          centerCaption="klaim"
          segments={verdicts.segments.map((segment) => ({ color: VERDICT_FILL[segment.verdict], count: segment.count }))}
        />
        <ul className="grid min-w-0 flex-1 gap-1.5">
          {verdicts.segments.map((segment) => (
            <li key={segment.verdict} className="flex items-center gap-2 text-[12px]">
              <span className={cn("size-2 shrink-0 rounded-full", VERDICT_STYLE[segment.verdict].accent)} />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{VERDICT_STYLE[segment.verdict].label}</span>
              <span className="font-mono text-[11px] tabular-nums text-foreground/80">{segment.count}</span>
            </li>
          ))}
        </ul>
      </div>
    </WidgetCard>
  );
}

function MomentumModule({ momentum, onSelectTopic }: { momentum: TopicMomentum[]; onSelectTopic: (name: string) => void }) {
  if (momentum.length === 0) return null;
  return (
    <div>
      <SectionHeader title="Momentum topik" icon={<TrendingUpIcon className="size-3.5" />} />
      <div className="grid grid-cols-2 gap-2.5">
        {momentum.map(({ item, values, changePct }) => {
          const up = changePct >= 0;
          return (
            <button
              key={item._id}
              type="button"
              onClick={() => onSelectTopic(item.title)}
              title={`Cari paper tentang ${item.title}`}
              className="rounded-[12px] border border-border bg-card p-3 text-left transition-colors hover:border-foreground/25"
            >
              <span className="line-clamp-1 text-[12px] font-semibold text-foreground">{item.title}</span>
              <span
                className={cn(
                  "mt-1 inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums",
                  up ? "text-mint-foreground" : "text-coral-foreground",
                )}
              >
                <ArrowUpRightIcon className={cn("size-3", !up && "rotate-90")} />
                {Math.abs(changePct).toFixed(0)}%
              </span>
              <Sparkline
                values={values}
                className="mt-2 h-7"
                stroke={up ? "var(--mint)" : "var(--coral)"}
                fill={up ? "var(--mint-soft)" : "var(--coral-soft)"}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

const AVATAR_TINTS = [
  "bg-mint-soft text-mint-foreground",
  "bg-sky-soft text-sky-foreground",
  "bg-coral-soft text-coral-foreground",
  "bg-lavender-soft text-lavender-foreground",
  "bg-lemon-soft text-lemon-foreground",
];

function TrendingModule({ topTopics, onSelectTopic }: { topTopics: TopTopic[]; onSelectTopic: (name: string) => void }) {
  if (topTopics.length === 0) return null;
  const rows = topTopics.slice(0, 6);
  return (
    <WidgetCard className="p-3">
      <div className="px-1">
        <SectionHeader title="Sedang ramai" icon={<SparklesIcon className="size-3.5" />} />
      </div>
      <ul className="space-y-0.5">
        {rows.map((topic, index) => (
          <li key={topic.name}>
            <button
              type="button"
              onClick={() => onSelectTopic(topic.name)}
              title={`Cari paper tentang ${topic.name} · ${topic.count}`}
              className="flex w-full items-center gap-2.5 rounded-[9px] p-1.5 text-left transition-colors hover:bg-muted"
            >
              <span
                className={cn(
                  "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold uppercase",
                  AVATAR_TINTS[index % AVATAR_TINTS.length],
                )}
                aria-hidden
              >
                {topic.name.trim()[0] ?? "•"}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-foreground">{topic.name}</span>
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{topic.count}</span>
            </button>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}

function MostCitedModule({ topCited }: { topCited: TopCitedPaper[] }) {
  if (topCited.length === 0) return null;
  return (
    <WidgetCard className="p-3">
      <div className="px-1">
        <SectionHeader title="Paling disitir" icon={<Quote className="size-3.5" />} />
      </div>
      <ul className="space-y-0.5">
        {topCited.map(({ item, count }, index) => (
          <li key={item.paperKey ?? item.title}>
            <Link
              href={feedDetailHref(item) ?? item.url}
              className="group flex items-center gap-2.5 rounded-[9px] p-1.5 transition-colors hover:bg-muted"
            >
              <span
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-mint-soft font-mono text-[12px] font-bold tabular-nums text-mint-foreground"
                aria-hidden
              >
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-[12.5px] font-medium leading-snug text-muted-foreground group-hover:text-foreground">
                  {item.title}
                </span>
              </span>
              <span
                className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground"
                title={formatCitationCount(count) ?? undefined}
              >
                {compactCount(count)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}

function compactCount(value: number): string {
  return value >= 1_000
    ? `${(value / 1_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })}rb`
    : value.toLocaleString("id-ID");
}

"use client";

import {
  ArrowUpRightIcon,
  GaugeIcon,
  Quote,
  SparklesIcon,
  TrendingUpIcon,
} from "@aqsha/ui/icons";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  formatCitationCount,
  type TopCitedPaper,
  type TopicMomentum,
  type TopTopic,
  type VerdictBreakdown,
} from "../utils/discovery-format";
import type { DiscoveryView } from "../hooks/use-discovery-nav";
import { feedDetailHref } from "./discovery-item-card";
import { Donut, Sparkline, VERDICT_FILL, VERDICT_STYLE } from "./discovery-visuals";

// The fixed second sidebar for the discovery surface — a lean "widget deck" of
// data-backed modules derived entirely from the items already loaded. Each view
// shows its most useful modules, kept focused and within the sticky viewport:
//   • Brief  → fact balance (donut) + topic momentum / most-cited + trending
//   • Papers → trending topics + most-cited papers
// The Brief middle slot prefers topic momentum (GDELT sparklines) but falls back
// to most-cited papers when the topic lane is empty, so the rail keeps three
// widgets instead of collapsing to two. Modules also self-hide without data.
export function DiscoveryAside({
  view,
  verdicts,
  momentum,
  topTopics,
  topCited,
  onSelectTopic,
}: {
  view: DiscoveryView;
  verdicts: VerdictBreakdown;
  momentum: TopicMomentum[];
  topTopics: TopTopic[];
  topCited: TopCitedPaper[];
  onSelectTopic: (name: string) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      {view === "brief" ? <FactBalanceModule verdicts={verdicts} /> : null}
      {view === "brief" ? (
        momentum.length > 0 ? (
          <MomentumModule momentum={momentum} onSelectTopic={onSelectTopic} />
        ) : (
          <MostCitedModule topCited={topCited} />
        )
      ) : null}
      <TrendingModule topTopics={topTopics} onSelectTopic={onSelectTopic} />
      {view === "papers" ? <MostCitedModule topCited={topCited} /> : null}
    </div>
  );
}

// ── Shared chrome ─────────────────────────────────────────────────────────
function SectionHeader({ title, icon }: { title: string; icon?: ReactNode }) {
  return (
    <h2 className="mb-3 flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
      {icon}
      {title}
    </h2>
  );
}

function WidgetCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-[14px] border border-border bg-card p-4", className)}>
      {children}
    </section>
  );
}

// ── Module 1: fact-balance hero card (donut + legend) ─────────────────────
function FactBalanceModule({ verdicts }: { verdicts: VerdictBreakdown }) {
  if (verdicts.total === 0) return null;
  return (
    <WidgetCard>
      <SectionHeader
        title="Timbangan fakta hari ini"
        icon={<GaugeIcon className="size-3.5" />}
      />
      <div className="flex items-center gap-4">
        <Donut
          total={verdicts.total}
          size={92}
          centerLabel={String(verdicts.total)}
          centerCaption="klaim"
          segments={verdicts.segments.map((segment) => ({
            color: VERDICT_FILL[segment.verdict],
            count: segment.count,
          }))}
        />
        <ul className="grid min-w-0 flex-1 gap-1.5">
          {verdicts.segments.map((segment) => (
            <li key={segment.verdict} className="flex items-center gap-2 text-[12px]">
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  VERDICT_STYLE[segment.verdict].accent,
                )}
              />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {VERDICT_STYLE[segment.verdict].label}
              </span>
              <span className="font-mono text-[11px] tabular-nums text-foreground/80">
                {segment.count}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </WidgetCard>
  );
}

// ── Module 2: topic momentum (sparkline movers, 2-up tiles) ───────────────
// Mirrors the reference's market-outlook tiles: a small grid of name + delta +
// sparkline cards. Rising series read mint, falling read coral. Clicking a tile
// searches papers for that topic.
function MomentumModule({
  momentum,
  onSelectTopic,
}: {
  momentum: TopicMomentum[];
  onSelectTopic: (name: string) => void;
}) {
  if (momentum.length === 0) return null;
  return (
    <div>
      <SectionHeader title="Momentum topik" icon={<TrendingUpIcon className="size-3.5" />} />
      <div className="grid grid-cols-2 gap-2.5">
        {momentum.map(({ item, values, changePct }) => {
          const up = changePct >= 0;
          const name = item.titleId ?? item.title;
          return (
            <button
              key={item._id ?? item.title}
              type="button"
              onClick={() => onSelectTopic(item.title)}
              title={`Cari paper tentang ${name}`}
              className="rounded-[12px] border border-border bg-card p-3 text-left transition-colors hover:border-foreground/25"
            >
              <span className="line-clamp-1 text-[12px] font-semibold text-foreground">
                {name}
              </span>
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

// ── Module 3: trending topics (ranked list, clickable) ────────────────────
// Avatar tint cycles through the palette so each row reads like a distinct
// "ticker", mirroring the reference's trending-companies list.
const AVATAR_TINTS = [
  "bg-mint-soft text-mint-foreground",
  "bg-sky-soft text-sky-foreground",
  "bg-coral-soft text-coral-foreground",
  "bg-lavender-soft text-lavender-foreground",
  "bg-lemon-soft text-lemon-foreground",
];

function TrendingModule({
  topTopics,
  onSelectTopic,
}: {
  topTopics: TopTopic[];
  onSelectTopic: (name: string) => void;
}) {
  if (topTopics.length === 0) return null;
  const rows = topTopics.slice(0, 6);
  return (
    <WidgetCard className="p-3">
      <div className="px-1">
        <SectionHeader
          title="Sedang ramai"
          icon={<SparklesIcon className="size-3.5" />}
        />
      </div>
      <ul className="space-y-0.5">
        {rows.map((topic, index) => (
          <li key={topic.name}>
            <button
              type="button"
              onClick={() => onSelectTopic(topic.name)}
              title={`Cari paper tentang ${topic.name} · ${topic.count}`}
              className="flex w-full items-center gap-2.5 rounded-[9px] px-1.5 py-1.5 text-left transition-colors hover:bg-muted"
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
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-foreground">
                {topic.name}
              </span>
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                {topic.count}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}

// ── Module 4: most-cited papers (ranked list) ─────────────────────────────
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
              className="group flex items-center gap-2.5 rounded-[9px] px-1.5 py-1.5 transition-colors hover:bg-muted"
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

// Compact citation count for the inline label ("1.2k"); the full
// "1,234 citations" text lives in the row's title attribute.
function compactCount(value: number): string {
  return value >= 1_000
    ? `${(value / 1_000).toLocaleString("en", { maximumFractionDigits: 1 })}k`
    : value.toLocaleString("en");
}

"use client";

import { GaugeIcon, LayersIcon, Quote, TrendingUpIcon } from "@aqsha/ui/icons";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  formatCitationCount,
  type FeedKind,
  type KindBreakdown,
  type TopCitedPaper,
  type TopTopic,
  type VerdictBreakdown,
} from "../utils/discovery-format";
import { feedDetailHref, kindLabel } from "./discovery-item-card";
import {
  CompositionBar,
  Donut,
  VERDICT_FILL,
  VERDICT_STYLE,
} from "./discovery-visuals";

// The fixed second sidebar for the discovery surface — a column of compact,
// data-backed visual modules derived entirely from the items already loaded:
// fact-balance donut, feed composition, trending topics, and most-cited papers.
// Each module hides itself when it has no data, so the rail self-sizes per view
// (Brief shows up to 4, Papers shows 2) and stays within the sticky viewport.
export function DiscoveryAside({
  verdicts,
  kinds,
  topTopics,
  topCited,
  onSelectTopic,
}: {
  verdicts: VerdictBreakdown;
  kinds: KindBreakdown;
  topTopics: TopTopic[];
  topCited: TopCitedPaper[];
  onSelectTopic: (name: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <FactBalanceModule verdicts={verdicts} />
      <CompositionModule kinds={kinds} />
      <TrendingModule topTopics={topTopics} onSelectTopic={onSelectTopic} />
      <MostCitedModule topCited={topCited} />
    </div>
  );
}

function ModuleShell({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[14px] border border-border bg-card p-4">
      <h2 className="mb-3 flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

// ── Module 1: fact-balance donut ──────────────────────────────────────────
function FactBalanceModule({ verdicts }: { verdicts: VerdictBreakdown }) {
  if (verdicts.total === 0) return null;
  return (
    <ModuleShell
      title="Timbangan fakta hari ini"
      icon={<GaugeIcon className="size-3.5" />}
    >
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
            <li
              key={segment.verdict}
              className="flex items-center gap-2 text-[12px]"
            >
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
    </ModuleShell>
  );
}

// ── Module 2: feed composition ────────────────────────────────────────────
// Distinct tones per kind. `--lemon` and `--sky-soft` collapse to the same taupe
// in this palette, so `news`/`topic` use chart-3/chart-5 to stay distinguishable.
const KIND_FILL: Record<FeedKind, string> = {
  paper: "var(--mint)",
  news: "var(--chart-3)",
  claim: "var(--coral)",
  topic: "var(--chart-5)",
  idea: "var(--lavender)",
};

function CompositionModule({ kinds }: { kinds: KindBreakdown }) {
  if (kinds.distinctKinds < 2) return null;
  return (
    <ModuleShell
      title="Isi feed hari ini"
      icon={<LayersIcon className="size-3.5" />}
    >
      <CompositionBar
        segments={kinds.segments.map((segment) => ({
          color: KIND_FILL[segment.kind],
          count: segment.count,
          label: kindLabel(segment.kind),
        }))}
      />
      <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
        {kinds.segments.map((segment) => (
          <li
            key={segment.kind}
            className="flex items-center gap-1.5 text-[11.5px] font-medium text-muted-foreground"
          >
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: KIND_FILL[segment.kind] }}
            />
            {kindLabel(segment.kind)}
            <span className="font-mono text-[11px] tabular-nums text-foreground/70">
              {segment.count}
            </span>
          </li>
        ))}
      </ul>
    </ModuleShell>
  );
}

// ── Module 3: trending topics (weighted tag cloud, clickable) ─────────────
// Distinct from the ranked bars below: frequency is encoded by chip size + tint
// (three tiers) rather than bar length, so each rail module reads differently.
function TrendingModule({
  topTopics,
  onSelectTopic,
}: {
  topTopics: TopTopic[];
  onSelectTopic: (name: string) => void;
}) {
  if (topTopics.length === 0) return null;
  const chips = topTopics.slice(0, 8);
  const max = Math.max(1, ...chips.map((topic) => topic.count));
  return (
    <ModuleShell title="Sedang ramai" icon={<TrendingUpIcon className="size-3.5" />}>
      <div className="flex flex-wrap items-center gap-1.5">
        {chips.map((topic) => (
          <button
            key={topic.name}
            type="button"
            onClick={() => onSelectTopic(topic.name)}
            title={`Cari paper tentang ${topic.name} · ${topic.count}`}
            className={cn(
              "max-w-full truncate rounded-full border px-2.5 py-1 leading-none transition-colors",
              chipTierClass(topic.count / max),
            )}
          >
            {topic.name}
          </button>
        ))}
      </div>
    </ModuleShell>
  );
}

// Size + tint tier for a trending chip, by its share of the busiest topic.
function chipTierClass(ratio: number): string {
  if (ratio > 0.66) {
    return "border-mint-soft-border bg-mint-soft text-mint-foreground text-[14px] font-semibold";
  }
  if (ratio > 0.33) {
    return "border-border bg-card text-foreground text-[12.5px] font-medium hover:bg-muted";
  }
  return "border-transparent bg-muted/50 text-muted-foreground text-[11.5px] font-medium hover:bg-muted";
}

// ── Module 4: most-cited papers ───────────────────────────────────────────
function MostCitedModule({ topCited }: { topCited: TopCitedPaper[] }) {
  if (topCited.length === 0) return null;
  const max = Math.max(1, ...topCited.map((paper) => paper.count));
  return (
    <ModuleShell title="Paling disitir" icon={<Quote className="size-3.5" />}>
      <ul className="space-y-3">
        {topCited.map(({ item, count }) => (
          <li key={item.paperKey ?? item.title}>
            <Link
              href={feedDetailHref(item) ?? item.url}
              className="group block"
            >
              <span className="line-clamp-2 text-[12.5px] font-medium leading-snug text-muted-foreground group-hover:text-foreground">
                {item.title}
              </span>
              <span className="mt-1.5 flex items-center gap-2">
                <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-mint"
                    style={{ width: `${(count / max) * 100}%` }}
                  />
                </span>
                <span
                  className="shrink-0 font-mono text-[10.5px] tabular-nums text-muted-foreground"
                  title={formatCitationCount(count) ?? undefined}
                >
                  {compactCount(count)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </ModuleShell>
  );
}

// Compact citation count for the inline bar label ("1.2k"); the full
// "1,234 citations" text lives in the row's title attribute.
function compactCount(value: number): string {
  return value >= 1_000
    ? `${(value / 1_000).toLocaleString("en", { maximumFractionDigits: 1 })}k`
    : value.toLocaleString("en");
}

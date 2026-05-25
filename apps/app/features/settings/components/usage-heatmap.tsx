import { cn } from "@/lib/utils";
import type { ActivityRow } from "../lib/types";

const featureLabels: Record<keyof ActivityRow["featureCounts"], string> = {
  normal_chat: "Normal chat",
  cited_answer: "Cited answer",
  deep_research: "Deep Research",
  external_search: "External search",
};

export function UsageHeatmap({ rows }: { rows: ActivityRow[] }) {
  const max = Math.max(1, ...rows.map((row) => row.credits));
  const totalCredits = rows.reduce((sum, row) => sum + row.credits, 0);
  const totalEvents = rows.reduce((sum, row) => sum + row.eventCount, 0);

  return (
    <div className="min-w-0">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground">Credits activity</h3>
          <p className="text-sm text-muted-foreground">
            {totalCredits} credits dari {totalEvents} event dalam 365 hari
          </p>
        </div>
      </div>
      <div className="max-w-full overflow-hidden">
        <div className="grid grid-flow-col grid-rows-7 gap-1 [grid-auto-columns:10px]">
          {rows.map((row) => (
            <HeatmapCell key={row.date} row={row} max={max} />
          ))}
        </div>
      </div>
      <FeatureBreakdown rows={rows} />
    </div>
  );
}

function HeatmapCell({ row, max }: { row: ActivityRow; max: number }) {
  const ratio = row.credits / max;
  const level = row.credits === 0 ? 0 : ratio > 0.75 ? 4 : ratio > 0.45 ? 3 : ratio > 0.2 ? 2 : 1;
  const classes = [
    "bg-muted/45",
    "border-sky-soft-border bg-sky-soft",
    "border-mint-soft-border bg-mint-soft",
    "border-lemon-soft-border bg-lemon-soft",
    "border-lavender-soft-border bg-lavender-soft",
  ];

  return (
    <div
      title={`${row.date}: ${row.credits} credits, ${row.eventCount} events`}
      className={cn("size-[10px] rounded-[2px] border border-transparent", classes[level])}
    />
  );
}

function FeatureBreakdown({ rows }: { rows: ActivityRow[] }) {
  const totals = rows.reduce<Record<keyof ActivityRow["featureCounts"], number>>(
    (acc, row) => {
      for (const feature of Object.keys(featureLabels) as Array<keyof ActivityRow["featureCounts"]>) {
        acc[feature] += row.featureCounts[feature];
      }
      return acc;
    },
    {
      normal_chat: 0,
      cited_answer: 0,
      deep_research: 0,
      external_search: 0,
    },
  );
  const visible = Object.entries(totals).filter(([, count]) => count > 0) as Array<[
    keyof ActivityRow["featureCounts"],
    number,
  ]>;

  return (
    <div className="mt-4 flex flex-wrap gap-2 text-[12px] text-muted-foreground">
      {visible.map(([feature, count]) => (
        <span key={feature} className="rounded-full border border-border bg-muted px-2.5 py-1 font-medium">
          {featureLabels[feature]}: {count}
        </span>
      ))}
      {visible.length === 0 ? <span>Belum ada usage ledger.</span> : null}
    </div>
  );
}

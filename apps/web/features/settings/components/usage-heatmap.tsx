import { cn } from "@/lib/utils";
import type { ActivityRow } from "../lib/types";

const featureLabels: Record<keyof ActivityRow["featureCounts"], string> = {
  normal_chat: "Chat Astra Lite",
  pro_chat: "Chat Astra Pro",
  cited_answer: "Jawaban dengan sitasi",
  deep_research: "Deep research",
  external_search: "Pencarian eksternal",
};

export function UsageHeatmap({ rows }: { rows: ActivityRow[] }) {
  const max = Math.max(1, ...rows.map((row) => row.credits));
  const totalCredits = rows.reduce((sum, row) => sum + row.credits, 0);
  const totalEvents = rows.reduce((sum, row) => sum + row.eventCount, 0);

  return (
    <div className="min-w-0">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-foreground">Aktivitas kredit</h3>
          <p className="text-[13px] text-muted-foreground">
            {totalCredits} kredit dari {totalEvents} event dalam 365 hari
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
  const level =
    row.credits === 0 ? 0 : ratio > 0.75 ? 4 : ratio > 0.45 ? 3 : ratio > 0.2 ? 2 : 1;

  return (
    <span
      title={`${row.date}: ${row.credits} kredit`}
      className={cn(
        "size-2.5 rounded-[3px] border border-transparent",
        level === 0 && "bg-muted/80",
        level === 1 && "bg-primary/25",
        level === 2 && "bg-primary/45",
        level === 3 && "bg-primary/70",
        level === 4 && "bg-primary",
      )}
    />
  );
}

function FeatureBreakdown({ rows }: { rows: ActivityRow[] }) {
  const totals = rows.reduce(
    (acc, row) => {
      for (const key of Object.keys(featureLabels) as Array<keyof ActivityRow["featureCounts"]>) {
        acc[key] += row.featureCounts[key];
      }
      return acc;
    },
    {
      normal_chat: 0,
      pro_chat: 0,
      cited_answer: 0,
      deep_research: 0,
      external_search: 0,
    },
  );

  const entries = (
    Object.keys(featureLabels) as Array<keyof ActivityRow["featureCounts"]>
  ).flatMap((key) => {
    const value = totals[key];
    return value > 0 ? [{ key, label: featureLabels[key], value }] : [];
  });

  if (entries.length === 0) return null;

  return (
    <div className="mt-5 grid gap-2 border-t border-border/50 pt-4">
      {entries.map((entry) => (
        <div key={entry.key} className="flex items-center justify-between gap-3 text-[12px]">
          <span className="text-muted-foreground">{entry.label}</span>
          <span className="font-medium text-foreground">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

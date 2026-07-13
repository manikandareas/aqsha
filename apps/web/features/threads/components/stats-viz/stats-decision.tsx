"use client";

import type { StatsDecisionBlock } from "@aqsha/chat-core/stats-viz";
import { STATS_VERDICT_META } from "./verdict-meta";

/**
 * Kartu kesimpulan rule-based: judul + daftar keputusan. Tiap keputusan membawa chip verdict
 * (rule-based, dihitung Python — bukan tulisan model) + narasi interpretasi bergaya Bab 4.
 * Bukan tabel bernomor (bukan "Tabel n"): pelengkap naratif tabel di atasnya.
 */
export function StatsDecisionCard({ block }: { block: StatsDecisionBlock }) {
  return (
    <div className="stats-viz my-5 min-w-0 rounded-xl border bg-muted/20 p-4 not-prose">
      <p className="mb-3 font-semibold text-[13px] text-foreground leading-5">{block.title}</p>
      <ul className="flex flex-col gap-3">
        {block.decisions.map((d) => {
          const meta = STATS_VERDICT_META[d.verdict];
          return (
            <li key={d.id} className="flex min-w-0 flex-col gap-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 font-medium text-[11px] ${meta.chip}`}
                >
                  <span className={`size-1.5 rounded-full ${meta.dot}`} aria-hidden />
                  {meta.label}
                </span>
                {d.label ? (
                  <span className="min-w-0 font-medium text-[12.5px] text-foreground">{d.label}</span>
                ) : null}
                {d.rule ? (
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground/80">
                    {d.rule}
                  </span>
                ) : null}
              </div>
              {d.interpretation ? (
                <p className="min-w-0 break-words text-[12.5px] text-muted-foreground leading-5">
                  {d.interpretation}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

"use client";

import type { StatsGroupSummary } from "@aqsha/chat-core/stats-viz";
import { cn } from "@/lib/utils";
import { STATS_VERDICT_META } from "./verdict-meta";

/**
 * Chip verdict agregat satu grup uji — SATU sumber render untuk struk kartu run
 * (`analysis-run-card`) DAN list panel Statistik (`stats-list-panel`), supaya keduanya tak
 * pernah berbeda kosakata/warna. Warna dari `STATS_VERDICT_META` (light+dark, tak color-alone:
 * selalu ada teks label). Verdict ber-nol disembunyikan; grup tanpa decision → tak ada chip.
 * Mengembalikan fragment span → penyusunan (gap/wrap) diserahkan ke wadah pemanggil.
 */
export function StatsVerdictChips({ summary }: { summary: StatsGroupSummary }) {
  const chips = (
    Object.keys(STATS_VERDICT_META) as Array<keyof typeof STATS_VERDICT_META>
  ).filter((verdict) => summary.verdicts[verdict] > 0);
  if (chips.length === 0) return null;
  return (
    <>
      {chips.map((verdict) => {
        const meta = STATS_VERDICT_META[verdict];
        return (
          <span
            key={verdict}
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-medium text-[11px]",
              meta.chip,
            )}
          >
            <span className={cn("size-1.5 rounded-full", meta.dot)} aria-hidden />
            {summary.verdicts[verdict]} {meta.label.toLowerCase()}
          </span>
        );
      })}
    </>
  );
}

/** "3 tabel · 1 gambar" — bagian ber-nol disembunyikan; dua-duanya nol → "hasil tersimpan". */
export function statsCountsLabel(tables: number, figures: number): string {
  const parts = [
    ...(tables > 0 ? [`${tables} tabel`] : []),
    ...(figures > 0 ? [`${figures} gambar`] : []),
  ];
  return parts.length > 0 ? parts.join(" · ") : "hasil tersimpan";
}

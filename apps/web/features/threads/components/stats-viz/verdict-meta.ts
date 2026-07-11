import type { StatsVerdict } from "@aqsha/chat-core/stats-viz";

/**
 * Label + kelas warna per verdict (light+dark, tak color-alone — selalu ada teks label).
 * Modul non-komponen agar kartu keputusan (`stats-decision`) DAN chip verdict agregat kartu run
 * (`analysis-run-card`) memakai satu sumber warna tanpa merusak Fast Refresh.
 */
export const STATS_VERDICT_META: Record<StatsVerdict, { label: string; dot: string; chip: string }> = {
  lolos: {
    label: "Terpenuhi",
    dot: "bg-emerald-500",
    chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  tidak_lolos: {
    label: "Tidak terpenuhi",
    dot: "bg-rose-500",
    chip: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  },
  perhatian: {
    label: "Perlu perhatian",
    dot: "bg-amber-500",
    chip: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
};

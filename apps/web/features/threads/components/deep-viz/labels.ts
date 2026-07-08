// Label + warna + ikon bersama komponen evidence viz `/deep`. Warna stance = token CSS
// `--viz-stance-*` (apps/web/app/globals.css, tervalidasi dataviz per mode light/dark) —
// komponen TIDAK menulis hex sendiri. Copy sentence case (aturan copywriting no-uppercase).

import {
  DEEP_VIZ_STANCES,
  type DeepVizDesignBucket,
  type DeepVizStance,
  type DeepVizStudyDesign,
} from "@aqsha/chat-core/deep-viz";
import {
  BookOpenIcon,
  ChartColumnIcon,
  EyeIcon,
  FileTextIcon,
  FlaskConicalIcon,
  SearchIcon,
} from "@aqsha/ui/icons";
import type { ComponentType } from "react";

export const STANCE_ORDER: readonly DeepVizStance[] = DEEP_VIZ_STANCES;

export const STANCE_LABELS: Record<DeepVizStance, string> = {
  yes: "Ya",
  possibly: "Mungkin",
  mixed: "Campuran",
  no: "Tidak",
};

/** Warna stance via CSS var token (adaptif light/dark) — dipakai sbg `style.background`. */
export const STANCE_COLORS: Record<DeepVizStance, string> = {
  yes: "var(--viz-stance-yes)",
  possibly: "var(--viz-stance-possibly)",
  mixed: "var(--viz-stance-mixed)",
  no: "var(--viz-stance-no)",
};

export const DESIGN_LABELS: Record<DeepVizStudyDesign, string> = {
  meta_analysis: "meta-analisis",
  systematic_review: "tinjauan sistematis",
  rct: "RCT",
  observational: "observasional",
  review: "review",
  other: "lainnya",
};

/** Ikon badge design ala Consensus (chip kecil di legend meter) — dari `@aqsha/ui/icons`. */
export const DESIGN_ICONS: Record<DeepVizStudyDesign, ComponentType<{ className?: string }>> = {
  meta_analysis: ChartColumnIcon,
  systematic_review: SearchIcon,
  rct: FlaskConicalIcon,
  observational: EyeIcon,
  review: BookOpenIcon,
  other: FileTextIcon,
};

export const DESIGN_BUCKET_LABELS: Record<DeepVizDesignBucket, string> = {
  meta_sysrev: "Meta/tinjauan sistematis",
  rct: "RCT",
  observational: "Observasional",
  other: "Lainnya",
};

export const CLAIM_LABELS: Record<"strong" | "moderate" | "limited", string> = {
  strong: "Kuat",
  moderate: "Sedang",
  limited: "Terbatas",
};

/** Warna isi meter kekuatan klaim: kuat=hijau, sedang=kuning (token stance), terbatas=netral. */
export const CLAIM_COLORS: Record<"strong" | "moderate" | "limited", string> = {
  strong: "var(--viz-stance-yes)",
  moderate: "var(--viz-stance-possibly)",
  limited: "var(--muted-foreground)",
};

/**
 * Track (segmen tak terisi) meter kekuatan = step lebih terang dari ramp warna isinya
 * (spec meter dataviz: state terbaca di sepanjang bar, bukan cuma bagian terisi).
 */
export const CLAIM_TRACK_COLORS: Record<"strong" | "moderate" | "limited", string> = {
  strong: "color-mix(in oklab, var(--viz-stance-yes) 22%, var(--muted))",
  moderate: "color-mix(in oklab, var(--viz-stance-possibly) 22%, var(--muted))",
  limited: "color-mix(in oklab, var(--muted-foreground) 18%, var(--muted))",
};

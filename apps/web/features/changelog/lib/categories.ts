import type { ComponentType, SVGProps } from "react";

import { SparklesIcon, TrendingUpIcon, WrenchIcon } from "@aqsha/ui/icons";

import type { ChangelogCategory } from "../types";

type CategoryMeta = {
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Kelas badge — pakai token soft (mint/sky) & muted, bukan warna hardcode. */
  className: string;
};

/**
 * Peta kategori → tampilan badge. Tiga kategori dibedakan lewat token semantik:
 * baru=mint (segar), peningkatan=sky (naik), perbaikan=netral (muted).
 */
export const CATEGORY_META: Record<ChangelogCategory, CategoryMeta> = {
  baru: {
    label: "Baru",
    Icon: SparklesIcon,
    className: "bg-mint-soft text-mint-foreground border-mint-soft-border",
  },
  peningkatan: {
    label: "Peningkatan",
    Icon: TrendingUpIcon,
    className: "bg-sky-soft text-sky-foreground border-sky-soft-border",
  },
  perbaikan: {
    label: "Perbaikan",
    Icon: WrenchIcon,
    className: "bg-muted text-muted-foreground border-border",
  },
};

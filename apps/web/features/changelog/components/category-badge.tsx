import { cn } from "@/lib/utils";
import { CATEGORY_META } from "@/features/changelog/lib/categories";
import type { ChangelogCategory } from "@/features/changelog/types";

/** Pill kategori changelog (baru / peningkatan / perbaikan) — ikon + label. */
export function CategoryBadge({ category }: { category: ChangelogCategory }) {
  const meta = CATEGORY_META[category];
  if (!meta) return null;

  const { label, Icon, className } = meta;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium leading-none",
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {label}
    </span>
  );
}

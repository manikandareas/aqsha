import type { CSSProperties } from "react";

import { CATEGORY_META } from "@/lib/changelog/categories";
import { changelogEase, changelogGutter } from "@/lib/changelog/layout";
import type { ChangelogEntry } from "@/lib/changelog/types";
import { formatDateId } from "@/lib/dates";

function metaLine(entry: ChangelogEntry): string {
  const parts = [formatDateId(entry.publishedAt)];
  if (entry.version) parts.push(`v${entry.version}`);
  if (entry.categories.length > 0) {
    parts.push(
      entry.categories
        .map((c) => CATEGORY_META[c]?.label)
        .filter(Boolean)
        .join(", "),
    );
  }
  return parts.join(" · ");
}

/**
 * Baris changelog — pola sama dengan BlogCard: tanggal/meta, judul, excerpt.
 * Tanpa kartu/thumbnail; hover full-lebar baris.
 */
export function ChangelogCard({
  entry,
  index = 0,
}: {
  entry: ChangelogEntry;
  index?: number;
}) {
  return (
    <a
      href={entry.url}
      style={
        { "--tw-animation-delay": `${Math.min(index, 8) * 60}ms` } as CSSProperties
      }
      className={`group block animate-in fade-in fill-mode-both duration-500 ${changelogGutter} py-5 transition-colors ${changelogEase} hover:bg-muted/40`}
    >
      <p className="text-xs text-muted-foreground">{metaLine(entry)}</p>

      <h2 className="mt-1.5 text-base font-medium leading-snug text-foreground sm:text-[1.0625rem]">
        {entry.title}
      </h2>

      {entry.excerpt ? (
        <p className="mt-1.5 line-clamp-2 max-w-xl text-sm leading-6 text-muted-foreground">
          {entry.excerpt}
        </p>
      ) : null}
    </a>
  );
}

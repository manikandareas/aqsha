import Link from "next/link";

import { CategoryBadge } from "@/features/changelog/components/category-badge";
import { ChangelogDateline } from "@/features/changelog/components/changelog-dateline";
import { ChangelogPreview } from "@/features/changelog/components/changelog-preview";
import type { ChangelogEntry } from "@/features/changelog/types";

/**
 * Kartu changelog compact (1 kolom, horizontal di desktop): thumbnail di kiri,
 * lalu tanggal (aksen) + judul + ringkasan singkat + badge di kanan. Seluruh
 * kartu link ke halaman detail — body MDX lengkap hidup di sana, bukan di kartu.
 */
export function ChangelogCard({ entry }: { entry: ChangelogEntry }) {
  return (
    <Link
      href={entry.url}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card transition-colors hover:border-border sm:min-h-[8.5rem] sm:flex-row"
    >
      <ChangelogPreview
        entry={entry}
        className="aspect-[16/9] border-b border-border/60 sm:aspect-auto sm:w-52 sm:shrink-0 sm:border-r sm:border-b-0"
      />

      <div className="flex-1 p-5">
        <ChangelogDateline entry={entry} className="text-xs" />

        <h2 className="mt-1.5 text-base font-semibold leading-snug text-foreground transition-colors group-hover:text-foreground/70">
          {entry.title}
        </h2>

        {entry.excerpt && (
          <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-muted-foreground">
            {entry.excerpt}
          </p>
        )}

        {entry.categories.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {entry.categories.map((category) => (
              <CategoryBadge key={category} category={category} />
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

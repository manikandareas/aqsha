import { ArrowLeftIcon } from "@/components/icons";
import { CategoryBadge } from "@/components/changelog/category-badge";
import { ChangelogPreview } from "@/components/changelog/changelog-preview";
import { CATEGORY_META } from "@/lib/changelog/categories";
import { changelogEase } from "@/lib/changelog/layout";
import type { ChangelogEntry } from "@/lib/changelog/types";
import { formatDateId } from "@/lib/dates";

/**
 * Header detail changelog — mirror BlogPostHeader: back link, judul, meta,
 * lalu preview opsional (gambar frontmatter atau cover generatif).
 */
export function ChangelogPostHeader({ entry }: { entry: ChangelogEntry }) {
  const categoryLabels = entry.categories
    .map((c) => CATEGORY_META[c]?.label)
    .filter(Boolean);

  return (
    <header className="animate-in fade-in fill-mode-both duration-500">
      <a
        href="/changelog"
        className={`group inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors ${changelogEase} hover:text-foreground`}
      >
        <ArrowLeftIcon
          className={`size-4 transition-transform ${changelogEase} group-hover:-translate-x-0.5`}
        />
        Semua pembaruan
      </a>

      <h1 className="mt-8 text-balance font-heading text-[1.9rem] font-medium leading-[1.18] text-foreground sm:text-[2.4rem]">
        {entry.title}
      </h1>

      <p className="mt-3 text-sm text-muted-foreground">
        {formatDateId(entry.publishedAt)}
        {entry.version ? (
          <>
            <span className="px-1.5 text-muted-foreground/40">·</span>
            v{entry.version}
          </>
        ) : null}
        {categoryLabels.length > 0 ? (
          <>
            <span className="px-1.5 text-muted-foreground/40">·</span>
            {categoryLabels.join(", ")}
          </>
        ) : null}
      </p>

      {entry.categories.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {entry.categories.map((category) => (
            <CategoryBadge key={category} category={category} />
          ))}
        </div>
      ) : null}

      <ChangelogPreview
        entry={entry}
        sizes="(min-width: 768px) 720px, 100vw"
        className="mt-8 aspect-[16/9] rounded-xl border-2 border-border sm:mt-10"
      />
    </header>
  );
}

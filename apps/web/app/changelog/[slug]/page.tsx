import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MDXContent } from "@content-collections/mdx/react";

import { ArrowLeftIcon } from "@aqsha/ui/icons";

import { mdxComponents } from "@/components/mdx-components";
import { createPageMetadata } from "@/lib/metadata";
import { CategoryBadge } from "@/features/changelog/components/category-badge";
import { ChangelogDateline } from "@/features/changelog/components/changelog-dateline";
import { ChangelogPreview } from "@/features/changelog/components/changelog-preview";
import {
  getPublishedEntry,
  publishedEntries,
} from "@/features/changelog/lib/entries";
import {
  changelogColumn,
  changelogEase,
  changelogGutter,
} from "@/features/changelog/lib/layout";

// Changelog 100% statis: hanya slug dari generateStaticParams yang valid.
export const dynamicParams = false;

type PageParams = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return publishedEntries().map((entry) => ({ slug: entry.slug }));
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { slug } = await params;
  const entry = getPublishedEntry(slug);
  if (!entry) return {};

  return createPageMetadata({
    title: entry.title,
    description: entry.excerpt,
    path: entry.url,
  });
}

export default async function ChangelogEntryPage({ params }: PageParams) {
  const { slug } = await params;
  const entry = getPublishedEntry(slug);
  if (!entry) notFound();

  return (
    <main className={`${changelogColumn} py-14 sm:py-20`}>
      <div className={changelogGutter}>
        <header className="animate-in fade-in fill-mode-both duration-500">
          <Link
            href="/changelog"
            className={`group inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors ${changelogEase} hover:text-foreground`}
          >
            <ArrowLeftIcon
              className={`size-4 transition-transform ${changelogEase} group-hover:-translate-x-0.5`}
            />
            Semua pembaruan
          </Link>

          <ChangelogDateline entry={entry} className="mt-8 text-sm" />
          <h1 className="mt-2 text-balance font-serif text-[1.9rem] leading-[1.18] text-foreground sm:text-[2.4rem]">
            {entry.title}
          </h1>
          {entry.categories.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {entry.categories.map((category) => (
                <CategoryBadge key={category} category={category} />
              ))}
            </div>
          )}
        </header>

        <ChangelogPreview
          entry={entry}
          sizes="(min-width: 768px) 720px, 100vw"
          className="mt-8 aspect-[16/9] rounded-xl border border-border/60 sm:mt-10"
        />

        <article className="aqsha-prose changelog-prose mt-8 sm:mt-10">
          <MDXContent code={entry.mdx} components={mdxComponents} />
        </article>
      </div>
    </main>
  );
}

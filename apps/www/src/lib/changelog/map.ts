import type { CollectionEntry } from "astro:content";

import type { ChangelogEntry } from "@/lib/content-types";

function deriveExcerpt(content: string, max = 160): string {
  const text = content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

function toIsoDate(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

export function mapChangelogEntry(
  entry: CollectionEntry<"changelog">,
  rawBody = "",
): ChangelogEntry {
  const slug = entry.id.replace(/\.mdx$/, "");
  return {
    id: entry.id,
    slug,
    url: `/changelog/${slug}`,
    title: entry.data.title,
    publishedAt: toIsoDate(entry.data.publishedAt),
    version: entry.data.version,
    categories: entry.data.categories,
    summary: entry.data.summary,
    preview: entry.data.preview,
    draft: entry.data.draft,
    excerpt:
      entry.data.summary ??
      deriveExcerpt(rawBody || entry.data.summary || entry.data.title),
  };
}

export type { ChangelogEntry } from "@/lib/content-types";

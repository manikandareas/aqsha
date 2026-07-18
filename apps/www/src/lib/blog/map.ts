import type { CollectionEntry } from "astro:content";

import type { BlogPost } from "@/lib/content-types";

function readingTimeMinutes(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

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

/** Normalize Astro blog collection entry for UI components. */
export function mapBlogEntry(
  entry: CollectionEntry<"blog">,
  rawBody = "",
): BlogPost {
  const slug = entry.id.replace(/\.mdx$/, "");
  return {
    id: entry.id,
    slug,
    url: `/blog/${slug}`,
    title: entry.data.title,
    description: entry.data.description,
    publishedAt: toIsoDate(entry.data.publishedAt),
    updated: entry.data.updated ? toIsoDate(entry.data.updated) : undefined,
    tags: entry.data.tags,
    cover: entry.data.cover,
    author: entry.data.author,
    draft: entry.data.draft,
    readingTime: readingTimeMinutes(rawBody || entry.data.description || entry.data.title),
    excerpt:
      entry.data.description ??
      deriveExcerpt(rawBody || entry.data.description || entry.data.title),
  };
}

export type { BlogPost } from "@/lib/content-types";

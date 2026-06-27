import { allPosts } from "content-collections";

import type { BlogPost } from "../types";

/** Post non-draft, terbaru dulu — satu sumber untuk index, sitemap, & static params. */
export function publishedPosts(): BlogPost[] {
  return allPosts
    .filter((post) => !post.draft)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

/** Lookup satu post non-draft by slug (undefined kalau draft / tidak ada). */
export function getPublishedPost(slug: string): BlogPost | undefined {
  return allPosts.find((post) => post.slug === slug && !post.draft);
}

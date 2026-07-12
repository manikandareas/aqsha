import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo-config";
import { publishedPosts } from "@/features/blog/lib/posts";
import { publishedEntries } from "@/features/changelog/lib/entries";

export default function sitemap(): MetadataRoute.Sitemap {
  const posts = publishedPosts().map((post) => ({
      url: `${siteUrl}${post.url}`,
      lastModified: new Date(post.updated ?? post.publishedAt),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }));

  // Changelog: halaman index + satu halaman detail per entri.
  const changelogEntries = publishedEntries();
  const changelogPages = changelogEntries.map((entry) => ({
    url: `${siteUrl}${entry.url}`,
    lastModified: new Date(entry.publishedAt),
    changeFrequency: "monthly" as const,
    priority: 0.5,
  }));

  return [
    { url: siteUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/blog`, changeFrequency: "weekly", priority: 0.7 },
    {
      url: `${siteUrl}/changelog`,
      lastModified: changelogEntries[0]
        ? new Date(changelogEntries[0].publishedAt)
        : undefined,
      changeFrequency: "weekly",
      priority: 0.6,
    },
    { url: `${siteUrl}/sign-up`, changeFrequency: "monthly", priority: 0.5 },
    ...changelogPages,
    ...posts,
  ];
}

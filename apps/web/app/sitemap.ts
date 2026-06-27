import type { MetadataRoute } from "next";
import { allPosts } from "content-collections";
import { siteUrl } from "@/lib/seo-config";

export default function sitemap(): MetadataRoute.Sitemap {
  const posts = allPosts
    .filter((post) => !post.draft)
    .map((post) => ({
      url: `${siteUrl}${post.url}`,
      lastModified: new Date(post.updated ?? post.publishedAt),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }));

  return [
    { url: siteUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/blog`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${siteUrl}/sign-up`, changeFrequency: "monthly", priority: 0.5 },
    ...posts,
  ];
}

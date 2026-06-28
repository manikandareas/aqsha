import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo-config";
import { publishedPosts } from "@/features/blog/lib/posts";

export default function sitemap(): MetadataRoute.Sitemap {
  const posts = publishedPosts().map((post) => ({
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

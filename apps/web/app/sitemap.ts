import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo-config";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/sign-up`, changeFrequency: "monthly", priority: 0.5 },
  ];
}

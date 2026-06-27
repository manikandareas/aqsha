import type { Metadata } from "next";
import { defaultDescription, locale, siteName } from "@/lib/seo-config";

export { siteName };

type PageMetadataInput = {
  title: string;
  description?: string;
  /** Path absolut situs (untuk canonical + og:url), mis. "/" atau "/sign-up". */
  path?: string;
};

export function createPageMetadata({
  title,
  description = defaultDescription,
  path = "/",
}: PageMetadataInput): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      siteName,
      locale,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

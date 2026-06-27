import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MDXContent } from "@content-collections/mdx/react";

import { createPageMetadata } from "@/lib/metadata";
import { siteUrl } from "@/lib/seo-config";
import { BlogPostHeader } from "@/features/blog/components/blog-post-header";
import { mdxComponents } from "@/features/blog/components/mdx-components";
import { blogColumn, blogGutter } from "@/features/blog/lib/layout";
import { getPublishedPost, publishedPosts } from "@/features/blog/lib/posts";

// Blog 100% statis: hanya slug dari generateStaticParams yang valid.
export const dynamicParams = false;

type PageParams = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return publishedPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { slug } = await params;
  const post = getPublishedPost(slug);
  if (!post) return {};

  const base = createPageMetadata({
    title: post.title,
    description: post.excerpt,
    path: post.url,
  });

  return {
    ...base,
    openGraph: {
      ...base.openGraph,
      type: "article",
      publishedTime: post.publishedAt,
      modifiedTime: post.updated ?? post.publishedAt,
      authors: post.author ? [post.author] : undefined,
      images: post.cover ? [{ url: post.cover }] : undefined,
    },
  };
}

export default async function BlogPostPage({ params }: PageParams) {
  const { slug } = await params;
  const post = getPublishedPost(slug);
  if (!post) notFound();

  // BlogPosting JSON-LD — referensi Organization existing (structured-data.tsx),
  // jangan redefine Organization/WebSite.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": `${siteUrl}${post.url}#article`,
    mainEntityOfPage: { "@type": "WebPage", "@id": `${siteUrl}${post.url}` },
    headline: post.title,
    description: post.excerpt,
    datePublished: post.publishedAt,
    dateModified: post.updated ?? post.publishedAt,
    inLanguage: "id-ID",
    url: `${siteUrl}${post.url}`,
    ...(post.cover ? { image: `${siteUrl}${post.cover}` } : {}),
    ...(post.author ? { author: { "@type": "Person", name: post.author } } : {}),
    publisher: { "@id": `${siteUrl}/#organization` },
  };

  return (
    <main className={`${blogColumn} py-14 sm:py-20`}>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD dari data internal statis.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className={blogGutter}>
        <BlogPostHeader post={post} />
        <article className="aqsha-prose blog-prose mt-10 sm:mt-12">
          <MDXContent code={post.mdx} components={mdxComponents} />
        </article>
      </div>
    </main>
  );
}

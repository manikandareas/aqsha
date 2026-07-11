import { defineCollection, defineConfig } from "@content-collections/core";
import { compileMDX } from "@content-collections/mdx";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeShiki from "@shikijs/rehype";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { z } from "zod";

/** Reading time kasar (≈200 wpm), dihitung sekali saat build → nol cost runtime. */
function readingTimeMinutes(content: string): number {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** Excerpt fallback: strip markdown ringan kalau frontmatter `description` kosong. */
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

const posts = defineCollection({
  name: "posts",
  directory: "content/blog",
  // Flat-only: file di subfolder bikin `_meta.path` ber-"/" → route [slug] tak match.
  include: "*.mdx",
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    publishedAt: z.iso.date(),
    updated: z.iso.date().optional(),
    tags: z.array(z.string()).default([]),
    cover: z.string().optional(), // mis. "/blog/<slug>/cover.jpg" (taruh di public/)
    author: z.string().optional(),
    draft: z.boolean().default(false),
    // Body MDX mentah — dideklarasikan eksplisit (bukan implicit) supaya
    // dipakai compileMDX + deriveExcerpt tanpa deprecation warning.
    content: z.string(),
  }),
  transform: async (doc, ctx) => {
    const mdx = await compileMDX(ctx, doc, {
      remarkPlugins: [remarkGfm],
      rehypePlugins: [
        [rehypeShiki, { theme: "github-dark" }],
        rehypeSlug,
        [rehypeAutolinkHeadings, { behavior: "wrap" }],
      ],
    });
    const slug = doc._meta.path;
    return {
      ...doc,
      mdx,
      slug,
      url: `/blog/${slug}`,
      readingTime: readingTimeMinutes(doc.content),
      excerpt: doc.description ?? deriveExcerpt(doc.content),
    };
  },
});

/** Kategori changelog — dipakai badge di timeline (label + ikon + warna di FE). */
const CHANGELOG_CATEGORIES = ["baru", "peningkatan", "perbaikan"] as const;

const changelog = defineCollection({
  name: "changelog",
  directory: "content/changelog",
  // Flat-only sama seperti blog: `_meta.path` jadi slug/anchor 1 segmen.
  include: "*.mdx",
  schema: z.object({
    title: z.string(),
    publishedAt: z.iso.date(),
    version: z.string().optional(), // mis. "1.4.0" — opsional
    categories: z.array(z.enum(CHANGELOG_CATEGORIES)).default([]),
    summary: z.string().optional(), // 1 kalimat untuk teaser landing + excerpt
    // Banner/preview kartu (mis. "/changelog/<slug>.png" di public/). Kalau
    // kosong → kartu pakai cover generatif deterministik.
    preview: z.string().optional(),
    draft: z.boolean().default(false),
    content: z.string(),
  }),
  transform: async (doc, ctx) => {
    // Plugin MDX di-inline (identik blog) supaya contextual typing tuple
    // rehype tetap ketat — mengekstrak ke const bikin tuple melebar.
    const mdx = await compileMDX(ctx, doc, {
      remarkPlugins: [remarkGfm],
      rehypePlugins: [
        [rehypeShiki, { theme: "github-dark" }],
        rehypeSlug,
        [rehypeAutolinkHeadings, { behavior: "wrap" }],
      ],
    });
    const slug = doc._meta.path;
    return {
      ...doc,
      mdx,
      slug,
      url: `/changelog/${slug}`,
      excerpt: doc.summary ?? deriveExcerpt(doc.content),
    };
  },
});

export default defineConfig({ content: [posts, changelog] });

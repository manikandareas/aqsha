import { defineCollection, defineConfig } from '@content-collections/core';
import { compileMarkdown } from '@content-collections/markdown';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeShiki from '@shikijs/rehype';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';
import { z } from 'zod';

/**
 * Content Collections config for blog and changelog.
 *
 * Uses `@content-collections/markdown` `compileMarkdown` (HTML string output) rather than MDX React
 * components. Content is pure markdown — same remark/rehype pipeline (remark-gfm, rehype-shiki
 * github-dark, rehype-slug, rehype-autolink-headings). Svelte pages render via `{@html post.mdx}`
 * inside `.aqsha-prose`.
 */

/** Reading time kasar (≈200 wpm), dihitung sekali saat build → nol cost runtime. */
function readingTimeMinutes(content: string): number {
	const words = content.trim().split(/\s+/).filter(Boolean).length;
	return Math.max(1, Math.round(words / 200));
}

/** Excerpt fallback: strip markdown ringan kalau frontmatter `description` kosong. */
function deriveExcerpt(content: string, max = 160): string {
	const text = content
		.replace(/```[\s\S]*?```/g, '')
		.replace(/!\[[^\]]*]\([^)]*\)/g, '')
		.replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
		.replace(/[#>*_`~]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
	return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

/**
 * Build-time hast transforms for rendered markdown links and images.
 * External links get `rel="noreferrer"`; images get `loading="lazy"` and default empty `alt`.
 * Internal links (`/...`, not `//host`) stay plain anchors — SvelteKit enhances same-origin `<a>` automatically.
 */
function rehypeAqshaMdxLinks() {
	return (tree: unknown) => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		visit(tree as any, 'element', (node: any) => {
			if (node.tagName === 'a') {
				const href = String(node.properties?.href ?? '');
				const isInternal = href.startsWith('/') && !href.startsWith('//');
				if (!isInternal) {
					node.properties ??= {};
					const rel = node.properties.rel;
					const relList = Array.isArray(rel)
						? [...rel]
						: rel
							? String(rel).split(/\s+/).filter(Boolean)
							: [];
					if (!relList.includes('noreferrer')) relList.push('noreferrer');
					node.properties.rel = relList;
				}
			} else if (node.tagName === 'img') {
				node.properties ??= {};
				node.properties.loading = 'lazy';
				if (node.properties.alt == null) node.properties.alt = '';
			}
		});
	};
}

const posts = defineCollection({
	name: 'posts',
	directory: 'content/blog',
	// Flat-only: file di subfolder bikin `_meta.path` ber-"/" → route [slug] tak match.
	include: '*.mdx',
	schema: z.object({
		title: z.string(),
		description: z.string().optional(),
		publishedAt: z.iso.date(),
		updated: z.iso.date().optional(),
		tags: z.array(z.string()).default([]),
		cover: z.string().optional(), // mis. "/blog/<slug>/cover.jpg" (taruh di static/)
		author: z.string().optional(),
		draft: z.boolean().default(false),
		// Body markdown mentah — dideklarasikan eksplisit supaya dipakai compileMarkdown + deriveExcerpt.
		content: z.string()
	}),
	transform: async (doc, ctx) => {
		const mdx = await compileMarkdown(ctx, doc, {
			allowDangerousHtml: true,
			remarkPlugins: [remarkGfm],
			rehypePlugins: [
				[rehypeShiki, { theme: 'github-dark' }],
				rehypeSlug,
				[rehypeAutolinkHeadings, { behavior: 'wrap' }],
				rehypeAqshaMdxLinks
			]
		});
		const slug = doc._meta.path;
		return {
			...doc,
			mdx,
			slug,
			url: `/blog/${slug}`,
			readingTime: readingTimeMinutes(doc.content),
			excerpt: doc.description ?? deriveExcerpt(doc.content)
		};
	}
});

/** Kategori changelog — dipakai badge di timeline (label + ikon + warna di FE). */
const CHANGELOG_CATEGORIES = ['baru', 'peningkatan', 'perbaikan'] as const;

const changelog = defineCollection({
	name: 'changelog',
	directory: 'content/changelog',
	// Flat-only sama seperti blog: `_meta.path` jadi slug/anchor 1 segmen.
	include: '*.mdx',
	schema: z.object({
		title: z.string(),
		publishedAt: z.iso.date(),
		version: z.string().optional(), // mis. "1.4.0" — opsional
		categories: z.array(z.enum(CHANGELOG_CATEGORIES)).default([]),
		summary: z.string().optional(), // 1 kalimat untuk teaser landing + excerpt
		// Banner/preview kartu (mis. "/changelog/<slug>.png" di static/). Kosong → cover generatif.
		preview: z.string().optional(),
		draft: z.boolean().default(false),
		content: z.string()
	}),
	transform: async (doc, ctx) => {
		// Plugin markdown di-inline (identik blog) supaya contextual typing tuple rehype tetap ketat.
		const mdx = await compileMarkdown(ctx, doc, {
			allowDangerousHtml: true,
			remarkPlugins: [remarkGfm],
			rehypePlugins: [
				[rehypeShiki, { theme: 'github-dark' }],
				rehypeSlug,
				[rehypeAutolinkHeadings, { behavior: 'wrap' }],
				rehypeAqshaMdxLinks
			]
		});
		const slug = doc._meta.path;
		return {
			...doc,
			mdx,
			slug,
			url: `/changelog/${slug}`,
			excerpt: doc.summary ?? deriveExcerpt(doc.content)
		};
	}
});

export default defineConfig({ content: [posts, changelog] });

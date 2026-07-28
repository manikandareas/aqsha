import type { RequestHandler } from './$types';
import { siteUrl } from '$lib/seo/config';
import { buildSitemapXml, type SitemapUrl } from '$lib/seo/handlers';
import { publishedPosts } from '$lib/features/blog/lib/posts';
import { publishedEntries } from '$lib/features/changelog/lib/entries';

// Runtime-rendered (not prerendered): `loc` uses runtime `PUBLIC_SITE_URL`.
export const prerender = false;

/** Sitemap — static routes plus blog/changelog entries. */
export const GET: RequestHandler = () => {
	const posts = publishedPosts();
	const entries = publishedEntries();

	const urls: SitemapUrl[] = [
		{ loc: siteUrl, changefreq: 'weekly', priority: 1 },
		{ loc: `${siteUrl}/blog`, changefreq: 'weekly', priority: 0.7 },
		{
			loc: `${siteUrl}/changelog`,
			lastmod: entries[0] ? new Date(entries[0].publishedAt).toISOString() : undefined,
			changefreq: 'weekly',
			priority: 0.6
		},
		{ loc: `${siteUrl}/sign-up`, changefreq: 'monthly', priority: 0.5 },
		// Changelog: satu halaman detail per entri.
		...entries.map((entry): SitemapUrl => ({
			loc: `${siteUrl}${entry.url}`,
			lastmod: new Date(entry.publishedAt).toISOString(),
			changefreq: 'monthly',
			priority: 0.5
		})),
		...posts.map((post): SitemapUrl => ({
			loc: `${siteUrl}${post.url}`,
			lastmod: new Date(post.updated ?? post.publishedAt).toISOString(),
			changefreq: 'monthly',
			priority: 0.6
		}))
	];

	return new Response(buildSitemapXml(urls), {
		headers: {
			'content-type': 'application/xml; charset=utf-8',
			'cache-control': 'public, max-age=0, must-revalidate'
		}
	});
};
